import * as FieldFlags from "../constants/field_flags.ts";
import * as Types from '../constants/types.ts';
import * as Charsets from '../constants/charsets.ts';
import * as helpers from '../helpers.ts';
import { genfun as genFunc } from "../../deps.ts";
import { getParser } from './parser_cache.ts';

const typeNames: string[] = [];
for (const t in Types) {
  // deno-lint-ignore no-explicit-any
  typeNames[(Types.default as any)[t]] = t;
}

// deno-lint-ignore no-explicit-any
function readCodeFor(field: any, config: any, options: any, fieldNum: any) {
  const supportBigNumbers =
    options.supportBigNumbers || config.supportBigNumbers;
  const bigNumberStrings = options.bigNumberStrings || config.bigNumberStrings;
  const timezone = options.timezone || config.timezone;
  const dateStrings = options.dateStrings || config.dateStrings;
  const unsigned = field.flags & FieldFlags.UNSIGNED;
  switch (field.columnType) {
    case Types.TINY:
      return unsigned ? 'packet.readInt8();' : 'packet.readSInt8();';
    case Types.SHORT:
      return unsigned ? 'packet.readInt16();' : 'packet.readSInt16();';
    case Types.LONG:
    case Types.INT24: // in binary protocol int24 is encoded in 4 bytes int32
      return unsigned ? 'packet.readInt32();' : 'packet.readSInt32();';
    case Types.YEAR:
      return 'packet.readInt16()';
    case Types.FLOAT:
      return 'packet.readFloat();';
    case Types.DOUBLE:
      return 'packet.readDouble();';
    case Types.NULL:
      return 'null;';
    case Types.DATE:
    case Types.DATETIME:
    case Types.TIMESTAMP:
    case Types.NEWDATE:
      if (helpers.typeMatch(field.columnType, dateStrings, Types)) {
        return `packet.readDateTimeString(${field.decimals});`;
      }
      return `packet.readDateTime('${timezone}');`;
    case Types.TIME:
      return 'packet.readTimeString()';
    case Types.DECIMAL:
    case Types.NEWDECIMAL:
      if (config.decimalNumbers) {
        return 'packet.parseLengthCodedFloat();';
      }
      return 'packet.readLengthCodedString("ascii");';
    case Types.GEOMETRY:
      return 'packet.parseGeometryValue();';
    case Types.JSON:
      // Since for JSON columns mysql always returns charset 63 (BINARY),
      // we have to handle it according to JSON specs and use "utf8",
      // see https://github.com/sidorares/node-mysql2/issues/409
      return 'JSON.parse(packet.readLengthCodedString("utf8"));';
    case Types.LONGLONG:
      if (!supportBigNumbers) {
        return unsigned
          ? 'packet.readInt64JSNumber();'
          : 'packet.readSInt64JSNumber();';
      }
      if (bigNumberStrings) {
        return unsigned
          ? 'packet.readInt64String();'
          : 'packet.readSInt64String();';
      }
      return unsigned ? 'packet.readInt64();' : 'packet.readSInt64();';

    default:
      if (field.characterSet === Charsets.BINARY) {
        return 'packet.readLengthCodedBuffer();';
      }
      return `packet.readLengthCodedString(fields[${fieldNum}].encoding)`;
  }
}

// deno-lint-ignore no-explicit-any
function compile(fields: any, options: any, config: any) {
  const parserFn = genFunc();
  let i = 0;
  const nullBitmapLength = Math.floor((fields.length + 7 + 2) / 8);

  /* eslint-disable no-trailing-spaces */
  /* eslint-disable no-spaced-func */
  /* eslint-disable no-unexpected-multiline */

  parserFn('(function(){');
  parserFn('return class BinaryRow {');
  parserFn('constructor() {');
  parserFn('}');

  parserFn('next(packet, fields, options) {');
  if (options.rowsAsArray) {
    parserFn(`const result = new Array(${fields.length});`);
  } else {
    parserFn("const result = {};");
  }

  // deno-lint-ignore no-explicit-any
  const resultTables: any = {};
  let resultTablesArray = [];

  if (options.nestTables === true) {
    for (i = 0; i < fields.length; i++) {
      resultTables[fields[i].table] = 1;
    }
    resultTablesArray = Object.keys(resultTables);
    for (i = 0; i < resultTablesArray.length; i++) {
      parserFn(`result[${helpers.srcEscape(resultTablesArray[i])}] = {};`);
    }
  }

  parserFn('packet.readInt8();'); // status byte
  for (i = 0; i < nullBitmapLength; ++i) {
    parserFn(`const nullBitmaskByte${i} = packet.readInt8();`);
  }

  let lvalue = '';
  let currentFieldNullBit = 4;
  let nullByteIndex = 0;
  let fieldName = '';
  let tableName = '';

  for (i = 0; i < fields.length; i++) {
    fieldName = helpers.srcEscape(fields[i].name);
    parserFn(`// ${fieldName}: ${typeNames[fields[i].columnType]}`);

    if (typeof options.nestTables === 'string') {
      tableName = helpers.srcEscape(fields[i].table);
      lvalue = `result[${helpers.srcEscape(
        fields[i].table + options.nestTables + fields[i].name
      )}]`;
    } else if (options.nestTables === true) {
      tableName = helpers.srcEscape(fields[i].table);
      lvalue = `result[${tableName}][${fieldName}]`;
    } else if (options.rowsAsArray) {
      lvalue = `result[${i.toString(10)}]`;
    } else {
      lvalue = `result[${helpers.srcEscape(fields[i].name)}]`;
    }

    // TODO: this used to be an optimisation ( if column marked as NOT_NULL don't include code to check null
    // bitmap at all, but it seems that we can't rely on this flag, see #178
    // TODO: benchmark performance difference
    //
    // if (fields[i].flags & FieldFlags.NOT_NULL) { // don't need to check null bitmap if field can't be null.
    //  result.push(lvalue + ' = ' + readCodeFor(fields[i], config));
    // } else if (fields[i].columnType == Types.NULL) {
    //  result.push(lvalue + ' = null;');
    // } else {
    parserFn(`if (nullBitmaskByte${nullByteIndex} & ${currentFieldNullBit})`);
    parserFn(`${lvalue} = null;`);
    parserFn('else');
    parserFn(`${lvalue} = ${readCodeFor(fields[i], config, options, i)}`);
    // }
    currentFieldNullBit *= 2;
    if (currentFieldNullBit === 0x100) {
      currentFieldNullBit = 1;
      nullByteIndex++;
    }
  }

  parserFn('return result;');
  parserFn('}');
  parserFn('};')('})()');

  /* eslint-enable no-trailing-spaces */
  /* eslint-enable no-spaced-func */
  /* eslint-enable no-unexpected-multiline */

  if (config.debug) {
    helpers.printDebugWithCode(
      'Compiled binary protocol row parser',
      parserFn.toString()
    );
  }
  return parserFn.toFunction(undefined);
}

// deno-lint-ignore no-explicit-any
function getBinaryParser(fields: any, options: any, config: any) {
  return getParser('binary', fields, options, config, compile);
}

export { getBinaryParser };
