import CursorType from "../constants/cursor.ts";
import CommandCodes from "../constants/commands.ts";
import * as Types from "../constants/types.ts";
import { Packet } from "../packets/packet.ts";
import { charset_encodings as CharsetToEncoding } from "../constants/charset_encodings.ts";
import { Buffer } from "../../deps.ts";

// deno-lint-ignore no-explicit-any
function isJSON(value: any) {
  return (
    Array.isArray(value) ||
    value.constructor === Object ||
    (typeof value.toJSON === 'function' && !Buffer.isBuffer(value))
  );
}

/**
 * Converts a value to an object describing type, String/Buffer representation and length
 * @param {*} value
 */
// deno-lint-ignore no-explicit-any
function toParameter(_this: any, value: any, encoding?: string, timezone?: string) {
  let type = Types.VAR_STRING;
  let length;
  // deno-lint-ignore no-explicit-any
  let writer = function(value: any) {
    // eslint-disable-next-line no-invalid-this
    return Packet.prototype.writeLengthCodedString.call(_this, value, encoding);
  };
  if (value !== null) {
    switch (typeof value) {
      case 'undefined':
        throw new TypeError('Bind parameters must not contain undefined');

      case 'number':
        type = Types.DOUBLE;
        length = 8;
        writer = Packet.prototype.writeDouble;
        break;

      case 'boolean':
        // deno-lint-ignore no-explicit-any
        value = value as any | 0;
        type = Types.TINY;
        length = 1;
        writer = Packet.prototype.writeInt8;
        break;

      case 'object':
        if (Object.prototype.toString.call(value) === '[object Date]') {
          type = Types.DATETIME;
          length = 12;
          writer = function(value) {
            // eslint-disable-next-line no-invalid-this
            return Packet.prototype.writeDate.call(_this, value, timezone);
          };
        } else if (isJSON(value)) {
          value = JSON.stringify(value);
          type = Types.JSON;
        } else if (Buffer.isBuffer(value)) {
          length = Packet.lengthCodedNumberLength(value.length) + value.length;
          writer = Packet.prototype.writeLengthCodedBuffer;
        }
        break;

      default:
        value = value.toString();
    }
  } else {
    value = '';
    type = Types.NULL;
  }
  if (!length) {
    length = Packet.lengthCodedStringLength(value, encoding);
  }
  return { value, type, length, writer };
}

class Execute {
  
  id: number;
  // deno-lint-ignore no-explicit-any
  parameters: any[];
  encoding: string;
  timezone?: string;
  
  // deno-lint-ignore no-explicit-any
  constructor(id: number, parameters: any[], charsetNumber: number, timezone?: string) {
    this.id = id;
    this.parameters = parameters;
    this.encoding = CharsetToEncoding[charsetNumber];
    this.timezone = timezone;
  }

  toPacket() {
    // TODO: don't try to calculate packet length in advance, allocate some big buffer in advance (header + 256 bytes?)
    // and copy + reallocate if not enough
    // 0 + 4 - length, seqId
    // 4 + 1 - COM_EXECUTE
    // 5 + 4 - stmtId
    // 9 + 1 - flags
    // 10 + 4 - iteration-count (always 1)
    let length = 14;
    let parameters;
    if (this.parameters && this.parameters.length > 0) {
      length += Math.floor((this.parameters.length + 7) / 8);
      length += 1; // new-params-bound-flag
      length += 2 * this.parameters.length; // type byte for each parameter if new-params-bound-flag is set
      // deno-lint-ignore no-explicit-any
      parameters = this.parameters.map((value: any) =>
        toParameter(this, value, this.encoding, this.timezone)
      );
      length += parameters.reduce(
        (accumulator, parameter) => accumulator + parameter.length,
        0
      );
    }
    const buffer = Buffer.allocUnsafe(length);
    const packet = new Packet(0, buffer, 0, length);
    packet.offset = 4;
    packet.writeInt8(CommandCodes.STMT_EXECUTE);
    packet.writeInt32(this.id);
    packet.writeInt8(CursorType.NO_CURSOR); // flags
    packet.writeInt32(1); // iteration-count, always 1
    if (parameters) {
      let bitmap = 0;
      let bitValue = 1;
      parameters.forEach(parameter => {
        if (parameter.type === Types.NULL) {
          bitmap += bitValue;
        }
        bitValue *= 2;
        if (bitValue === 256) {
          packet.writeInt8(bitmap);
          bitmap = 0;
          bitValue = 1;
        }
      });
      if (bitValue !== 1) {
        packet.writeInt8(bitmap);
      }
      // TODO: explain meaning of the flag
      // afaik, if set n*2 bytes with type of parameter are sent before parameters
      // if not, previous execution types are used (TODO prooflink)
      packet.writeInt8(1); // new-params-bound-flag
      // Write parameter types
      parameters.forEach(parameter => {
        packet.writeInt8(parameter.type); // field type
        packet.writeInt8(0); // parameter flag
      });
      // Write parameter values
      parameters.forEach(parameter => {
        if (parameter.type !== Types.NULL) {
          parameter.writer.call(packet, parameter.value);
        }
      });
    }
    return packet;
  }
}

export { Execute };
