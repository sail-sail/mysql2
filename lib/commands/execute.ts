import { ColumnDefinition } from "../packets/column_definition.ts";
import { Command } from "./command.ts";
import { Query } from "./query.ts";
import { Execute as PacketsExecute } from "../packets/execute.js";
import { Packet } from "../packets/packet.ts";
import { Connection } from "../connection.ts";

import { getBinaryParser } from "../parsers/binary_parser.ts";

class Execute extends Command {
  
  // deno-lint-ignore no-explicit-any
  statement: any;
  // deno-lint-ignore no-explicit-any
  values: any;
  // deno-lint-ignore no-explicit-any
  parameters: any;
  insertId: number;
  timeout: number;
  // deno-lint-ignore no-explicit-any
  _rows: any[];
  // deno-lint-ignore no-explicit-any
  _fields: any[];
  // deno-lint-ignore no-explicit-any
  _result: any[];
  _fieldCount: number;
  // deno-lint-ignore no-explicit-any
  _rowParser: any;
  // deno-lint-ignore no-explicit-any
  _executeOptions: any;
  _resultIndex: number;
  // deno-lint-ignore no-explicit-any
  _localStream: any;
  // deno-lint-ignore no-explicit-any
  _unpipeStream: any;
  // deno-lint-ignore no-explicit-any
  _streamFactory: any;
  _connection: Connection|null;
  // deno-lint-ignore no-explicit-any
  options: any;
  _receivedFieldsCount = 0;
  
  // deno-lint-ignore no-explicit-any
  constructor(options: any, callback: any) {
    super();
    this.statement = options.statement;
    this.sql = options.sql;
    this.values = options.values;
    this.onResult = callback;
    this.parameters = options.values;
    this.insertId = 0;
    this.timeout = options.timeout;
    this.queryTimeout = null;
    this._rows = [];
    this._fields = [];
    this._result = [];
    this._fieldCount = 0;
    this._rowParser = null;
    this._executeOptions = options;
    this._resultIndex = 0;
    this._localStream = null;
    this._unpipeStream = function() {};
    this._streamFactory = options.infileStreamFactory;
    this._connection = null;
  }

  // deno-lint-ignore no-explicit-any
  buildParserFromFields(fields: any[], connection: Connection) {
    return getBinaryParser(fields, this.options, connection.config);
  }

  start(_packet: Packet, connection: Connection) {
    this._connection = connection;
    this.options = Object.assign({}, connection.config, this._executeOptions);
    // deno-lint-ignore no-explicit-any
    (this as any)._setTimeout();
    const executePacket = new PacketsExecute(
      this.statement.id,
      this.parameters,
      connection.config.charsetNumber,
      connection.config.timezone
    );
    //For reasons why this try-catch is here, please see
    // https://github.com/sidorares/node-mysql2/pull/689
    //For additional discussion, see
    // 1. https://github.com/sidorares/node-mysql2/issues/493
    // 2. https://github.com/sidorares/node-mysql2/issues/187
    // 3. https://github.com/sidorares/node-mysql2/issues/480
    try {
      connection.writePacket(executePacket.toPacket());
    } catch (error) {
      // deno-lint-ignore no-explicit-any
      (this.onResult as any)(error);
    }
    // deno-lint-ignore no-explicit-any
    return (Execute.prototype as any).resultsetHeader;
  }

  // deno-lint-ignore no-explicit-any
  readField(packet: Packet, connection: Connection): any {
    let fields;
    // disabling for now, but would be great to find reliable way to parse fields only once
    // fields reported by prepare can be empty at all or just incorrect - see #169
    //
    // perfomance optimisation: if we already have this field parsed in statement header, use one from header
    // const field = this.statement.columns.length == this._fieldCount ?
    //  this.statement.columns[this._receivedFieldsCount] : new Packets.ColumnDefinition(packet);
    const field = new ColumnDefinition(
      packet,
      connection.clientEncoding
    );
    this._receivedFieldsCount++;
    this._fields[this._resultIndex].push(field);
    if (this._receivedFieldsCount === this._fieldCount) {
      fields = this._fields[this._resultIndex];
      this.emit('fields', fields, this._resultIndex);
      return Execute.prototype.fieldsEOF;
    }
    return Execute.prototype.readField;
  }

  fieldsEOF(packet: Packet, connection: Connection) {
    // check EOF
    if (!packet.isEOF()) {
      return connection.protocolError('Expected EOF packet');
    }
    this._rowParser = new (this.buildParserFromFields(
      this._fields[this._resultIndex],
      connection
    ))();
    // deno-lint-ignore no-explicit-any
    return (Execute.prototype as any).row;
  }
}

// deno-lint-ignore no-explicit-any
(Execute.prototype as any).done = Query.prototype.done;
// deno-lint-ignore no-explicit-any
(Execute.prototype as any).doneInsert = Query.prototype.doneInsert;
// deno-lint-ignore no-explicit-any
(Execute.prototype as any).resultsetHeader = Query.prototype.resultsetHeader;
// deno-lint-ignore no-explicit-any
(Execute.prototype as any)._findOrCreateReadStream =
  // deno-lint-ignore no-explicit-any
  (Query.prototype as any)._findOrCreateReadStream;
// deno-lint-ignore no-explicit-any
(Execute.prototype as any)._streamLocalInfile = Query.prototype._streamLocalInfile;
// deno-lint-ignore no-explicit-any
(Execute.prototype as any)._setTimeout = Query.prototype._setTimeout;
// deno-lint-ignore no-explicit-any
(Execute.prototype as any)._handleTimeoutError = Query.prototype._handleTimeoutError;
// deno-lint-ignore no-explicit-any
(Execute.prototype as any).row = Query.prototype.row;
// deno-lint-ignore no-explicit-any
(Execute.prototype as any).stream = Query.prototype.stream;

export { Execute };
