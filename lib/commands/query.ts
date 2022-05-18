import {
  Readable,
  Buffer,
} from "../../deps.ts";

import { Command } from "./command.ts";
import { Packet } from "../packets/packet.ts";
import { ResultSetHeader } from "../packets/resultset_header.ts";
import { getTextParser } from "../parsers/text_parser.ts";
import * as ServerStatus from "../constants/server_status.ts";
import { Connection } from "../connection.ts";
import { ColumnDefinition } from "../packets/column_definition.ts";
import { Query as PacketQuery } from "../packets/query.ts";

const EmptyPacket = new Packet(0, Buffer.allocUnsafe(4), 0, 4);

// http://dev.mysql.com/doc/internals/en/com-query.html
class Query extends Command {
  
  // deno-lint-ignore no-explicit-any
  values: any[];
  // deno-lint-ignore no-explicit-any
  _queryOptions: any;
  namedPlaceholders: boolean;
  // deno-lint-ignore no-explicit-any
  onResult?: any;
  timeout: number;
  _fieldCount: number;
  // deno-lint-ignore no-explicit-any
  _rowParser: any;
  // deno-lint-ignore no-explicit-any
  _fields: any[];
  // deno-lint-ignore no-explicit-any
  _rows: any[];
  _receivedFieldsCount: number;
  _resultIndex: number;
  // deno-lint-ignore no-explicit-any
  _localStream: any;
  // deno-lint-ignore ban-types
  _unpipeStream: Function;
  // deno-lint-ignore ban-types
  _streamFactory: Function;
  _connection: Connection|null;
  
  // deno-lint-ignore no-explicit-any
  options: any;
  
  _localStreamError: Error|undefined;
  
  // deno-lint-ignore ban-types no-explicit-any
  constructor(options: any, callback: Function) {
    super();
    this.sql = options.sql;
    this.values = options.values;
    this._queryOptions = options;
    this.namedPlaceholders = options.namedPlaceholders || false;
    this.onResult = callback;
    this.timeout = options.timeout;
    this.queryTimeout = null;
    this._fieldCount = 0;
    this._rowParser = null;
    this._fields = [];
    this._rows = [];
    this._receivedFieldsCount = 0;
    this._resultIndex = 0;
    this._localStream = null;
    this._unpipeStream = function() {};
    this._streamFactory = options.infileStreamFactory;
    this._connection = null;
  }

  /* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
  start(_packet: Packet, connection: Connection) {
    if (connection.config.debug) {
      // eslint-disable-next-line
      console.log('        Sending query command: %s', this.sql);
    }
    this._connection = connection;
    this.options = Object.assign({}, connection.config, this._queryOptions);
    this._setTimeout();

    const cmdPacket = new PacketQuery(
      this.sql as string,
      // deno-lint-ignore no-explicit-any
      connection.config.charsetNumber as any
    );
    // deno-lint-ignore no-explicit-any
    connection.writePacket((cmdPacket as any).toPacket(1));
    return Query.prototype.resultsetHeader;
  }

  done() {
    this._unpipeStream();
    // if all ready timeout, return null directly
    if (this.timeout && !this.queryTimeout) {
      return null;
    }
    // else clear timer
    if (this.queryTimeout) {
      clearTimeout(this.queryTimeout);
      this.queryTimeout = null;
    }
    if (this.onResult) {
      let rows, fields;
      if (this._resultIndex === 0) {
        rows = this._rows[0];
        fields = this._fields[0];
      } else {
        rows = this._rows;
        fields = this._fields;
      }
      if (fields) {
        this.onResult(null, rows, fields);
        // process.nextTick(() => {
        //   this.onResult(null, rows, fields);
        // });
      } else {
        this.onResult(null, rows);
        // process.nextTick(() => {
        //   this.onResult(null, rows);
        // });
      }
    }
    return null;
  }

  doneInsert(rs: ResultSetHeader|null) {
    if (this._localStreamError) {
      if (this.onResult) {
        this.onResult(this._localStreamError, rs);
      } else {
        this.emit('error', this._localStreamError);
      }
      return null;
    }
    this._rows.push(rs);
    this._fields.push(void 0);
    this.emit('fields', void 0);
    this.emit('result', rs);
    if ((rs?.serverStatus as number) & ServerStatus.SERVER_MORE_RESULTS_EXISTS) {
      this._resultIndex++;
      return this.resultsetHeader;
    }
    return this.done();
  }

  resultsetHeader(packet: Packet, connection: Connection) {
    const rs = new ResultSetHeader(packet, connection);
    this._fieldCount = rs.fieldCount;
    if (connection.config.debug) {
      // eslint-disable-next-line
      console.log(
        `        Resultset header received, expecting ${rs.fieldCount} column definition packets`
      );
    }
    if (this._fieldCount === 0) {
      return this.doneInsert(rs);
    }
    if (this._fieldCount === null) {
      return this._streamLocalInfile(connection, rs.infileName as string);
    }
    this._receivedFieldsCount = 0;
    this._rows.push([]);
    this._fields.push([]);
    return this.readField;
  }

  _streamLocalInfile(connection:Connection, path: string) {
    if (this._streamFactory) {
      this._localStream = this._streamFactory(path);
    } else {
      this._localStreamError = new Error(
        `As a result of LOCAL INFILE command server wants to read ${path} file, but as of v2.0 you must provide streamFactory option returning ReadStream.`
      );
      connection.writePacket(EmptyPacket);
      return this.infileOk;
    }

    const onConnectionError = () => {
      this._unpipeStream();
    };
    const onDrain = () => {
      this._localStream.resume();
    };
    const onPause = () => {
      this._localStream.pause();
    };
    const onData = function(data: Buffer) {
      const dataWithHeader = Buffer.allocUnsafe(data.length + 4);
      data.copy(dataWithHeader, 4);
      connection.writePacket(
        new Packet(0, dataWithHeader, 0, dataWithHeader.length)
      );
    };
    const onEnd = () => {
      connection.removeListener('error', onConnectionError);
      connection.writePacket(EmptyPacket);
    };
    const onError = (err: Error) => {
      this._localStreamError = err;
      connection.removeListener('error', onConnectionError);
      connection.writePacket(EmptyPacket);
    };
    this._unpipeStream = () => {
      connection.stream.removeListener('pause', onPause);
      connection.stream.removeListener('drain', onDrain);
      this._localStream.removeListener('data', onData);
      this._localStream.removeListener('end', onEnd);
      this._localStream.removeListener('error', onError);
    };
    connection.stream.on('pause', onPause);
    connection.stream.on('drain', onDrain);
    this._localStream.on('data', onData);
    this._localStream.on('end', onEnd);
    this._localStream.on('error', onError);
    connection.once('error', onConnectionError);
    return this.infileOk;
  }

  // deno-lint-ignore no-explicit-any
  readField(packet: Packet, connection: Connection): any {
    this._receivedFieldsCount++;
    // Often there is much more data in the column definition than in the row itself
    // If you set manually _fields[0] to array of ColumnDefinition's (from previous call)
    // you can 'cache' result of parsing. Field packets still received, but ignored in that case
    // this is the reason _receivedFieldsCount exist (otherwise we could just use current length of fields array)
    if (this._fields[this._resultIndex].length !== this._fieldCount) {
      const field = new ColumnDefinition(
        packet,
        connection.clientEncoding
      );
      this._fields[this._resultIndex].push(field);
      if (connection.config.debug) {
        /* eslint-disable no-console */
        console.log('        Column definition:');
        console.log(`          name: ${field.name}`);
        console.log(`          type: ${field.columnType}`);
        console.log(`         flags: ${field.flags}`);
        /* eslint-enable no-console */
      }
    }
    // last field received
    if (this._receivedFieldsCount === this._fieldCount) {
      const fields = this._fields[this._resultIndex];
      this.emit('fields', fields);
      // deno-lint-ignore no-explicit-any
      this._rowParser = new (getTextParser(fields, this.options, connection.config) as any)(fields);
      return Query.prototype.fieldsEOF;
    }
    return Query.prototype.readField;
  }

  fieldsEOF(packet: Packet, connection: Connection) {
    // check EOF
    if (!packet.isEOF()) {
      return connection.protocolError('Expected EOF packet');
    }
    return this.row;
  }

  /* eslint no-unused-vars: ["error", { "argsIgnorePattern": "^_" }] */
  // deno-lint-ignore no-explicit-any
  row(packet: Packet, _connection?: Connection): any { 
    if (packet.isEOF()) {
      const status = packet.eofStatusFlags();
      const moreResults = status & ServerStatus.SERVER_MORE_RESULTS_EXISTS;
      if (moreResults) {
        this._resultIndex++;
        return Query.prototype.resultsetHeader;
      }
      return this.done();
    }
    let row;
    try {
      row = this._rowParser.next(
        packet,
        this._fields[this._resultIndex],
        this.options
      );
    } catch (err) {
      this._localStreamError = err;
      return this.doneInsert(null);
    }
    if (this.onResult) {
      this._rows[this._resultIndex].push(row);
    } else {
      this.emit('result', row);
    }
    return Query.prototype.row;
  }

  infileOk(packet: Packet, connection: Connection) {
    const rs = new ResultSetHeader(packet, connection);
    return this.doneInsert(rs);
  }

  // deno-lint-ignore no-explicit-any
  stream(options?: any) {
    options = options || {};
    options.objectMode = true;
    const stream = new Readable(options);
    stream._read = () => {
      this._connection && this._connection.resume();
    };
    this.on('result', row => {
      if (!stream.push(row)) {
        this._connection?.pause();
      }
      stream.emit('result', row); // replicate old emitter
    });
    this.on('error', err => {
      stream.emit('error', err); // Pass on any errors
    });
    this.on('end', () => {
      stream.push(null); // pushing null, indicating EOF
      stream.emit('close'); // notify readers that query has completed
    });
    this.on('fields', fields => {
      stream.emit('fields', fields); // replicate old emitter
    });
    return stream;
  }

  _setTimeout() {
    if (this.timeout) {
      const timeoutHandler = this._handleTimeoutError.bind(this);
      this.queryTimeout = setTimeout(
        timeoutHandler,
        this.timeout
      );
    }
  }

  _handleTimeoutError() {
    if (this.queryTimeout) {
      clearTimeout(this.queryTimeout);
      this.queryTimeout = null;
    }
    
    const err = new Error('Query inactivity timeout');
    // deno-lint-ignore no-explicit-any
    (err as any).errorno = 'PROTOCOL_SEQUENCE_TIMEOUT';
    // deno-lint-ignore no-explicit-any
    (err as any).code = 'PROTOCOL_SEQUENCE_TIMEOUT';
    // deno-lint-ignore no-explicit-any
    (err as any).syscall = 'query';

    if (this.onResult) {
      this.onResult(err);
    } else {
      this.emit('error', err);
    }
  }
}

export { Query };
