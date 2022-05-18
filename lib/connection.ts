import {
  connect,
  Socket,
  Buffer,
  Readable,
  nextTick,
  // Stream,
} from "../deps.ts";
// import { createCredentials } from "node/crypto.ts";
import {
  // createSecureContext,
  // TLSSocket,
  // createSecurePair,
  named_placeholders,
} from "../deps.ts";
import { EventEmitter } from "../deps.ts";
import { Denque as Queue } from "../deps.ts";
import { sqlstring } from "../deps.ts";
import { LRUCache as LRU } from "../deps.ts";
import { Command } from "./commands/command.ts";
import { Packet } from "./packets/packet.ts";

import { PacketParser } from "./packet_parser.ts";
import { ClientHandshake } from "./commands/client_handshake.ts";
import { charset_encodings as CharsetToEncoding } from "./constants/charset_encodings.ts";
import { Query } from "./commands/query.ts";
import { Ping } from "./commands/ping.ts";
import { Prepare } from "./commands/prepare.ts";
import { Execute } from "./commands/execute.ts";
import { BinlogDump } from "./commands/binlog_dump.ts";
import { RegisterSlave } from "./commands/register_slave.ts";
import { Pool } from "./pool.ts";
import { ResultSetHeader } from "./packets/resultset_header.ts";
import { ColumnDefinition } from "./packets/column_definition.ts";
import { TextRow } from "./packets/text_row.ts";
import {
  EOF as PacketsEOF,
  Error as PacketsError,
  OK as PacketsOK,
} from "./packets/index.ts";
import { ServerHandshake } from "./commands/server_handshake.ts";
import { Quit } from "./commands/quit.ts";
import { ConnectionConfig } from "./connection_config.ts";

const namedPlaceholders = named_placeholders.createCompiler();

let _connectionId = 0;

export class Connection extends EventEmitter {
  
  config: ConnectionConfig;
  threadId: number|undefined|null;
  authorized: boolean|undefined;
  stream: Socket;
  
  #internalId: number;
  #commands: Queue;
  #command: Command|null;
  #paused: boolean;
  #paused_packets: Queue;
  // deno-lint-ignore no-explicit-any
  _statements: LRU<any, any>;
  serverCapabilityFlags: number;
  sequenceId: number;
  compressedSequenceId: number;
  
  _handshakePacket: Packet|null;
  _fatalError: Error|null;
  _protocolError: Error|null;
  _outOfOrderPackets: Packet[];
  
  clientEncoding: string;
  packetParser: PacketParser;
  
  connectTimeout: number|undefined;
  _closing = false;
  
  connectionId?: number;
  
  _pool: Pool|undefined|null;
  
  serverEncoding: string;
  // deno-lint-ignore no-explicit-any
  _authPlugin: any;
  // deno-lint-ignore no-explicit-any
  serverConfig: any;
  // deno-lint-ignore no-explicit-any
  clientHelloReply: any;
  
  constructor(
    opts: {
      config: ConnectionConfig,
    },
  ) {
    super();
    this.config = opts.config;
    if (!opts.config.stream) {
      if (opts.config.socketPath) {
        this.stream = connect(opts.config.socketPath);
      } else {
        this.stream = connect(
          opts.config.port || 3306,
          opts.config.host,
        );

        // Enable keep-alive on the socket.  It's disabled by default, but the
        // user can enable it and supply an initial delay.
        this.stream.setKeepAlive(true, this.config.keepAliveInitialDelay);
      }
    } else if (typeof opts.config.stream === 'function')  {
      this.stream = opts.config.stream(opts);
    } else {
      this.stream = opts.config.stream;
    }
    
    this.#internalId = _connectionId++;
    this.#commands = new Queue();
    this.#command = null;
    this.#paused = false;
    this.#paused_packets = new Queue();
    this._statements = new LRU({
      maxSize: this.config.maxPreparedStatements,
      // deno-lint-ignore no-explicit-any
      dispose: function(_key: any, statement: any) {
        return statement.close();
      },
      sizeCalculation: function() {
        return 1;
      },
    });
    this.serverCapabilityFlags = 0;
    this.authorized = false;
    this.sequenceId = 0;
    this.compressedSequenceId = 0;
    this.threadId = null;
    this._handshakePacket = null;
    this._fatalError = null;
    this._protocolError = null;
    this._outOfOrderPackets = [];
    this.clientEncoding = CharsetToEncoding[this.config.charsetNumber];
    this.stream.on('error', this._handleNetworkError.bind(this));
    // see https://gist.github.com/khoomeister/4985691#use-that-instead-of-bind
    this.packetParser = new PacketParser((p: Packet) => {
      this.handlePacket(p);
    });
    this.stream.on('data', data => {
      if (this.connectTimeout) {
        clearTimeout(this.connectTimeout);
        this.connectTimeout = undefined;
      }
      this.packetParser.execute(data);
    });
    this.stream.on('close', () => {
      // we need to set this flag everywhere where we want connection to close
      if (this._closing) {
        return;
      }
      if (!this._protocolError) {
        // no particular error message before disconnect
        this._protocolError = new Error(
          'Connection lost: The server closed the connection.'
        );
        // deno-lint-ignore no-explicit-any
        (this._protocolError as any).fatal = true;
        // deno-lint-ignore no-explicit-any
        (this._protocolError as any).code = 'PROTOCOL_CONNECTION_LOST';
      }
      this.#notifyError(this._protocolError);
    });
    let handshakeCommand: ClientHandshake;
    if (!this.config.isServer) {
      handshakeCommand = new ClientHandshake(this.config.clientFlags);
      handshakeCommand.on('end', () => {
        // this happens when handshake finishes early either because there was
        // some fatal error or the server sent an error packet instead of
        // an hello packet (for example, 'Too many connections' error)
        if (!handshakeCommand.handshake || this._fatalError || this._protocolError) {
          return;
        }
        this._handshakePacket = handshakeCommand.handshake;
        this.threadId = handshakeCommand.handshake.connectionId;
        this.emit('connect', handshakeCommand.handshake);
      });
      handshakeCommand.on('error', err => {
        this._closing = true;
        this.#notifyError(err);
      });
      if (this.addCommand) {
        this.addCommand(handshakeCommand as Command);
      }
    }
    // in case there was no initial handshake but we need to read sting, assume it utf-8
    // most common example: "Too many connections" error ( packet is sent immediately on connection attempt, we don't know server encoding yet)
    // will be overwritten with actual encoding value as soon as server handshake packet is received
    this.serverEncoding = 'utf8';
    if (this.config.connectTimeout) {
      const timeoutHandler = this._handleTimeoutError.bind(this);
      this.connectTimeout = setTimeout(
        timeoutHandler,
        this.config.connectTimeout
      );
    }
  }
  
  // http://dev.mysql.com/doc/internals/en/sequence-id.html
  //
  // The sequence-id is incremented with each packet and may wrap around.
  // It starts at 0 and is reset to 0 when a new command
  // begins in the Command Phase.
  // http://dev.mysql.com/doc/internals/en/example-several-mysql-packets.html
  _resetSequenceId() {
    this.sequenceId = 0;
    this.compressedSequenceId = 0;
  }
  
  _handleNetworkError(err: Error) {
    if (this.connectTimeout) {
      clearTimeout(this.connectTimeout);
      this.connectTimeout = undefined;
    }
    // Do not throw an error when a connection ends with a RST,ACK packet
    // deno-lint-ignore no-explicit-any
    if ((err as any).code === 'ECONNRESET' && this._closing) {
      return;
    }
    this.#handleFatalError(err);
  }
  
  #handleFatalError(err: Error) {
    // deno-lint-ignore no-explicit-any
    (err as any).fatal = true;
    // stop receiving packets
    (this.stream as Socket).removeAllListeners('data');
    // deno-lint-ignore no-explicit-any
    (this.addCommand as any) = this.#addCommandClosedState;
    this.write = () => {
      this.emit('error', new Error("Can't write in closed state"));
    };
    this.#notifyError(err);
    this._fatalError = err;
  }
  
  _handleTimeoutError() {
    if (this.connectTimeout) {
      clearTimeout(this.connectTimeout);
      this.connectTimeout = undefined;
    }
    this.stream.destroy && this.stream.destroy();
    const err = new Error('connect ETIMEDOUT');
    // deno-lint-ignore no-explicit-any
    (err as any).errorno = 'ETIMEDOUT';
    // deno-lint-ignore no-explicit-any
    (err as any).code = 'ETIMEDOUT';
    // deno-lint-ignore no-explicit-any
    (err as any).syscall = 'connect';
    this._handleNetworkError(err);
  }
  
  // notify all commands in the queue and bubble error as connection "error"
  // called on stream error or unexpected termination
  #notifyError(err: Error) {
    if (this.connectTimeout) {
      clearTimeout(this.connectTimeout);
      this.connectTimeout = undefined;
    }
    // prevent from emitting 'PROTOCOL_CONNECTION_LOST' after EPIPE or ECONNRESET
    if (this._fatalError) {
      return;
    }
    let command;
    // if there is no active command, notify connection
    // if there are commands and all of them have callbacks, pass error via callback
    let bubbleErrorToConnection = !this.#command;
    if (this.#command && this.#command.onResult) {
      this.#command.onResult(err);
      this.#command = null;
      // connection handshake is special because we allow it to be implicit
      // if error happened during handshake, but there are others commands in queue
      // then bubble error to other commands and not to connection
    } else if (
      !(
        this.#command &&
        this.#command.constructor === ClientHandshake &&
        this.#commands.length > 0
      )
    ) {
      bubbleErrorToConnection = true;
    }
    while ((command = this.#commands.shift())) {
      if (command.onResult) {
        command.onResult(err);
      } else {
        bubbleErrorToConnection = true;
      }
    }
    // notify connection if some comands in the queue did not have callbacks
    // or if this is pool connection ( so it can be removed from pool )
    if (bubbleErrorToConnection || this._pool) {
      this.emit('error', err);
    }
    // close connection after emitting the event in case of a fatal error
    // deno-lint-ignore no-explicit-any
    if ((err as any).fatal) {
      this.close();
    }
  }
  
  #addCommandClosedState(cmd: Command) {
    const err = new Error(
      "Can't add new command when connection is in closed state"
    );
    // deno-lint-ignore no-explicit-any
    (err as any).fatal = true;
    if (cmd.onResult) {
      cmd.onResult(err);
    } else {
      this.emit('error', err);
    }
  }
  
  write(buffer: Buffer) {
    const result = this.stream.write(buffer, err => {
      if (err) {
        this._handleNetworkError(err);
      }
    });

    if (!result) {
      this.stream.emit('pause');
    }
  }
  
  protocolError(message?: string, code?: string|number) {
    // Starting with MySQL 8.0.24, if the client closes the connection
    // unexpectedly, the server will send a last ERR Packet, which we can
    // safely ignore.
    // https://dev.mysql.com/worklog/task/?id=12999
    if (this._closing) {
      return;
    }

    const err = new Error(message);
    // deno-lint-ignore no-explicit-any
    (err as any).fatal = true;
    // deno-lint-ignore no-explicit-any
    (err as any).code = code || 'PROTOCOL_ERROR';
    this.emit('error', err);
  }
  
  handlePacket(packet?: Packet) {
    if (this.#paused) {
      this.#paused_packets.push(packet);
      return;
    }
    if (packet) {
      if (this.sequenceId !== packet.sequenceId) {
        const err = new Error(
          `Warning: got packets out of order. Expected ${this.sequenceId} but received ${packet.sequenceId}`
        );
        // deno-lint-ignore no-explicit-any
        (err as any).expected = this.sequenceId;
        // deno-lint-ignore no-explicit-any
        (err as any).received = packet.sequenceId;
        this.emit('warn', err); // REVIEW
        // eslint-disable-next-line no-console
        console.error(err.message);
      }
      this.#bumpSequenceId(packet.numPackets);
    }
    if (this.config.debug) {
      if (packet) {
        // eslint-disable-next-line no-console
        console.log(
          ` raw: ${packet.buffer
            .slice(packet.offset, packet.offset + packet.length())
            .toString('hex')}`
        );
        // eslint-disable-next-line no-console
        console.trace();
        const commandName = this.#command
          ? this.#command._commandName
          : '(no command)';
        const stateName = this.#command
          ? this.#command.stateName()
          : '(no command)';
        // eslint-disable-next-line no-console
        console.log(
          `${this.#internalId} ${this.connectionId} ==> ${commandName}#${stateName}(${[packet.sequenceId, packet.type(), packet.length()].join(',')})`
        );
      }
    }
    if (!this.#command) {
      const marker = packet && packet.peekByte();
      // If it's an Err Packet, we should use it.
      if (marker === 0xff && packet) {
        const error = PacketsError.fromPacket(packet);
        this.protocolError(error.message, error.code);
      } else {
        // Otherwise, it means it's some other unexpected packet.
        this.protocolError(
          'Unexpected packet while no commands in the queue',
          'PROTOCOL_UNEXPECTED_PACKET'
        );
      }
      this.close();
      return;
    }
    const done = this.#command.execute((packet as Packet), this);
    if (done) {
      this.#command = this.#commands.shift();
      if (this.#command) {
        this.sequenceId = 0;
        this.compressedSequenceId = 0;
        this.handlePacket();
      }
    }
  }
  
  #bumpSequenceId(numPackets: number) {
    this.sequenceId += numPackets;
    this.sequenceId %= 256;
  }
  
  addCommand(cmd: Command) {
    // this.compressedSequenceId = 0;
    // this.sequenceId = 0;
    if (this.config.debug) {
      const commandName = cmd.constructor.name;
      // eslint-disable-next-line no-console
      console.log(`Add command: ${commandName}`);
      cmd._commandName = commandName;
    }
    if (!this.#command) {
      this.#command = cmd;
      this.handlePacket();
    } else {
      this.#commands.push(cmd);
    }
    return cmd;
  }
  
  _bumpCompressedSequenceId(numPackets: number) {
    this.compressedSequenceId += numPackets;
    this.compressedSequenceId %= 256;
  }
  
  writePacket(packet: Packet) {
    const MAX_PACKET_LENGTH = 16777215;
    const length = packet.length();
    let chunk, offset, header;
    if (length < MAX_PACKET_LENGTH) {
      packet.writeHeader(this.sequenceId);
      if (this.config.debug) {
        // eslint-disable-next-line no-console
        console.log(
          `${this.#internalId} ${this.connectionId} <== ${this.#command?._commandName}#${this.#command?.stateName()}(${[this.sequenceId, packet._name, packet.length()].join(',')})`
        );
        // eslint-disable-next-line no-console
        console.log(
          `${this.#internalId} ${this.connectionId} <== ${packet.buffer.toString('hex')}`
        );
      }
      this.#bumpSequenceId(1);
      this.write(packet.buffer);
    } else {
      if (this.config.debug) {
        // eslint-disable-next-line no-console
        console.log(
          `${this.#internalId} ${this.connectionId} <== Writing large packet, raw content not written:`
        );
        // eslint-disable-next-line no-console
        console.log(
          `${this.#internalId} ${this.connectionId} <== ${this.#command?._commandName}#${this.#command?.stateName()}(${[this.sequenceId, packet._name, packet.length()].join(',')})`
        );
      }
      for (offset = 4; offset < 4 + length; offset += MAX_PACKET_LENGTH) {
        chunk = packet.buffer.slice(offset, offset + MAX_PACKET_LENGTH);
        if (chunk.length === MAX_PACKET_LENGTH) {
          header = Buffer.from([0xff, 0xff, 0xff, this.sequenceId]);
        } else {
          header = Buffer.from([
            chunk.length & 0xff,
            (chunk.length >> 8) & 0xff,
            (chunk.length >> 16) & 0xff,
            this.sequenceId
          ]);
        }
        this.#bumpSequenceId(1);
        this.write(header);
        this.write(chunk);
      }
    }
  }
  
  // 0.11+ environment
  startTLS(_onSecure: () => void,) {
    throw new Error('TLS is not supported in Deno');
  }
  
  pipe() {
    // if (this.stream instanceof Stream) {
    //   this.stream.ondata = (data, start, end) => {
    //     this.packetParser.execute(data, start, end);
    //   };
    // } else {
    //   this.stream.on('data', data => {
    //     this.packetParser.execute(
    //       data.parent,
    //       data.offset,
    //       data.offset + data.length
    //     );
    //   });
    // }
    this.stream.on('data', (data) => {
      this.packetParser.execute(
        data.parent,
        data.offset,
        data.offset + data.length
      );
    });
  }
  
  // deno-lint-ignore no-explicit-any
  format(sql: string, values?: any) {
    if (typeof this.config.queryFormat === 'function') {
      return this.config.queryFormat.call(
        this,
        sql,
        values,
        this.config.timezone
      );
    }
    const opts = {
      sql: sql,
      values: values
    };
    this.#resolveNamedPlaceholders(opts);
    return sqlstring.format(
      opts.sql,
      opts.values,
      this.config.stringifyObjects,
      this.config.timezone
    );
  }
  
  escape(value: string) {
    return sqlstring.escape(value, false, this.config.timezone);
  }

  escapeId(value: string) {
    return sqlstring.escapeId(value, false);
  }

  raw(sql: string) {
    return sqlstring.raw(sql);
  }

  #resolveNamedPlaceholders(options: {
    sql: string,
    // deno-lint-ignore no-explicit-any
    values?: any,
    namedPlaceholders?: boolean,
  }) {
    let unnamed;
    if (this.config.namedPlaceholders || options.namedPlaceholders) {
      if (Array.isArray(options.values)) {
        // if an array is provided as the values, assume the conversion is not necessary.
        // this allows the usage of unnamed placeholders even if the namedPlaceholders flag is enabled.
        return
      }
      unnamed = namedPlaceholders(options.sql, options.values);
      options.sql = unnamed[0];
      options.values = unnamed[1];
    }
  }
  
  // deno-lint-ignore no-explicit-any
  query(sql?: any, values?: any, cb?: any) {
    let cmdQuery: Query;
    if (sql.constructor === Query) {
      cmdQuery = sql;
    } else {
      cmdQuery = Connection.createQuery(sql, values, cb, this.config);
    }
    // deno-lint-ignore no-explicit-any
    this.#resolveNamedPlaceholders(cmdQuery as any);
    const rawSql = <string | undefined> this.format(cmdQuery.sql as string, cmdQuery.values !== undefined ? cmdQuery.values : []);
    cmdQuery.sql = rawSql;
    // deno-lint-ignore no-explicit-any
    return this.addCommand(cmdQuery as any);
  }
  
  // deno-lint-ignore no-explicit-any
  static createQuery(sql: any, values: any, cb: any, config: any) {
    // deno-lint-ignore no-explicit-any
    let options: any = {
      rowsAsArray: config.rowsAsArray
    };
    if (typeof sql === 'object') {
      // query(options, cb)
      options = sql;
      if (typeof values === 'function') {
        cb = values;
      } else if (values !== undefined) {
        options.values = values;
      }
    } else if (typeof values === 'function') {
      // query(sql, cb)
      cb = values;
      options.sql = sql;
      options.values = undefined;
    } else {
      // query(sql, values, cb)
      options.sql = sql;
      options.values = values;
    }
    return new Query(options, cb);
  }
  
  pause() {
    this.#paused = true;
    this.stream.pause();
  }

  resume() {
    let packet;
    this.#paused = false;
    while ((packet = this.#paused_packets.shift())) {
      this.handlePacket(packet);
      // don't resume if packet handler paused connection
      if (this.#paused) {
        return;
      }
    }
    this.stream.resume();
  }

  // TODO: named placeholders support
  // deno-lint-ignore ban-types no-explicit-any
  prepare(options: any, cb: Function) {
    if (typeof options === 'string') {
      options = { sql: options };
    }
    return this.addCommand(new Prepare(options, cb) as Command);
  }

  unprepare(sql: string) {
    // deno-lint-ignore no-explicit-any
    let options: any = {};
    if (typeof sql === 'object') {
      options = sql;
    } else {
      options.sql = sql;
    }
    const key = Connection.statementKey(options);
    const stmt = this._statements.get(key);
    if (stmt) {
      this._statements.delete(key);
      stmt.close();
    }
    return stmt;
  }
  
  // deno-lint-ignore no-explicit-any
  execute(sql: string, values?: any, cb?: any) {
    // deno-lint-ignore no-explicit-any
    let options: any = {};
    if (typeof sql === 'object') {
      // execute(options, cb)
      options = sql;
      if (typeof values === 'function') {
        cb = values;
      } else {
        options.values = options.values || values;
      }
    } else if (typeof values === 'function') {
      // execute(sql, cb)
      cb = values;
      options.sql = sql;
      options.values = undefined;
    } else {
      // execute(sql, values, cb)
      options.sql = sql;
      options.values = values;
    }
    this.#resolveNamedPlaceholders(options);
    // check for values containing undefined
    if (options.values) {
      //If namedPlaceholder is not enabled and object is passed as bind parameters
      if (!Array.isArray(options.values)) {
        throw new TypeError(
          'Bind parameters must be array if namedPlaceholders parameter is not enabled'
        );
      }
      options.values.forEach((val: string) => {
        //If namedPlaceholder is not enabled and object is passed as bind parameters
        if (!Array.isArray(options.values)) {
          throw new TypeError(
            'Bind parameters must be array if namedPlaceholders parameter is not enabled'
          );
        }
        if (val === undefined) {
          throw new TypeError(
            'Bind parameters must not contain undefined. To pass SQL NULL specify JS null'
          );
        }
        if (typeof val === 'function') {
          throw new TypeError(
            'Bind parameters must not contain function(s). To pass the body of a function as a string call .toString() first'
          );
        }
      });
    }
    const executeCommand = new Execute(options, cb);
    // deno-lint-ignore no-explicit-any
    const prepareCommand = new Prepare(options, (err?: Error, stmt?: any) => {
      if (err) {
        // skip execute command if prepare failed, we have main
        // combined callback here
        executeCommand.start = function() {
          return null;
        };
        if (cb) {
          cb(err);
        } else {
          executeCommand.emit('error', err);
        }
        executeCommand.emit('end');
        return;
      }
      executeCommand.statement = stmt;
    });
    this.addCommand(prepareCommand as Command);
    this.addCommand(executeCommand as Command);
    return executeCommand;
  }
  
  // transaction helpers
  // deno-lint-ignore no-explicit-any
  beginTransaction(cb: any) {
    return this.query('START TRANSACTION', cb);
  }

  // deno-lint-ignore no-explicit-any
  commit(cb: any) {
    return this.query('COMMIT', cb);
  }

  // deno-lint-ignore no-explicit-any
  rollback(cb: any) {
    return this.query('ROLLBACK', cb);
  }

  // deno-lint-ignore no-explicit-any
  ping(cb: any) {
    return this.addCommand(new Ping(cb) as Command);
  }

  // deno-lint-ignore no-explicit-any
  #registerSlave(opts: any, cb: any) {
    return this.addCommand(new RegisterSlave(opts, cb) as Command);
  }

  // deno-lint-ignore no-explicit-any
  #binlogDump(opts: any, cb?: any) {
    return this.addCommand(new BinlogDump(opts, cb) as Command);
  }

  // currently just alias to close
  destroy() {
    this.close();
  }

  close() {
    if (this.connectTimeout) {
      clearTimeout(this.connectTimeout);
      this.connectTimeout = undefined;
    }
    this._closing = true;
    this.stream.end();
    // deno-lint-ignore no-explicit-any
    this.addCommand = this.#addCommandClosedState as any;
  }
  
  // deno-lint-ignore no-explicit-any
  createBinlogStream(opts: any) {
    // TODO: create proper stream class
    // TODO: use through2
    let test = 1;
    const stream = new Readable({ objectMode: true });
    stream._read = function() {
      return {
        data: test++
      };
    };
    this.#registerSlave(opts, () => {
      const dumpCmd = this.#binlogDump(opts);
      dumpCmd.on('event', ev => {
        stream.push(ev);
      });
      dumpCmd.on('eof', () => {
        stream.push(null);
        // if non-blocking, then close stream to prevent errors
        if (opts.flags && opts.flags & 0x01) {
          this.close();
        }
      });
      // TODO: pipe errors as well
    });
    return stream;
  }

  // deno-lint-ignore no-explicit-any
  connect(cb: any) {
    if (!cb) {
      return;
    }
    if (this._fatalError || this._protocolError) {
      return cb(this._fatalError || this._protocolError);
    }
    if (this._handshakePacket) {
      return cb(null, this);
    }
    let connectCalled = 0;
    function callbackOnce(isErrorHandler: boolean) {
      // deno-lint-ignore no-explicit-any
      return function(param: any) {
        if (!connectCalled) {
          if (isErrorHandler) {
            cb(param);
          } else {
            cb(null, param);
          }
        }
        connectCalled = 1;
      };
    }
    this.once('error', callbackOnce(true));
    this.once('connect', callbackOnce(false));
  }

  // ===================================
  // outgoing server connection methods
  // ===================================
  // deno-lint-ignore no-explicit-any
  writeColumns(columns: any) {
    this.writePacket(ResultSetHeader.toPacket(columns.length));
    // deno-lint-ignore no-explicit-any
    columns.forEach((column: any) => {
      this.writePacket(
        ColumnDefinition.toPacket(column, this.serverConfig.encoding)
      );
    });
    this.writeEof();
  }

  // row is array of columns, not hash
  // deno-lint-ignore no-explicit-any
  writeTextRow(column: any) {
    this.writePacket(
      TextRow.toPacket(column, this.serverConfig.encoding)
    );
  }

  // deno-lint-ignore no-explicit-any
  writeTextResult(rows: any, columns: any) {
    this.writeColumns(columns);
    // deno-lint-ignore no-explicit-any
    rows.forEach((row: any) => {
      const arrayRow = new Array(columns.length);
      // deno-lint-ignore no-explicit-any
      columns.forEach((column: any) => {
        arrayRow.push(row[column.name]);
      });
      this.writeTextRow(arrayRow);
    });
    this.writeEof();
  }

  // deno-lint-ignore no-explicit-any
  writeEof(warnings?: any, statusFlags?: any) {
    this.writePacket(PacketsEOF.toPacket(warnings, statusFlags));
  }

  // deno-lint-ignore no-explicit-any
  writeOk(args?: any) {
    if (!args) {
      args = { affectedRows: 0 };
    }
    this.writePacket(PacketsOK.toPacket(args, this.serverConfig.encoding));
  }

  // deno-lint-ignore no-explicit-any
  writeError(args?: any) {
    // if we want to send error before initial hello was sent, use default encoding
    const encoding = this.serverConfig ? this.serverConfig.encoding : 'cesu8';
    this.writePacket(PacketsError.toPacket(args, encoding));
  }

  // deno-lint-ignore no-explicit-any
  serverHandshake(args?: any) {
    this.serverConfig = args;
    this.serverConfig.encoding =
      CharsetToEncoding[this.serverConfig.characterSet];
    return this.addCommand(new ServerHandshake(args) as Command);
  }

  // ===============================================================
  // deno-lint-ignore no-explicit-any
  end(callback?: any): any {
    if (this.config.isServer) {
      this._closing = true;
      const quitCmd = new EventEmitter();
      nextTick(() => {
        this.stream.end();
        quitCmd.emit('end');
      });
      return quitCmd;
    }
    // trigger error if more commands enqueued after end command
    const quitCmd = this.addCommand(new Quit(callback) as Command);
    // deno-lint-ignore no-explicit-any
    this.addCommand = this.#addCommandClosedState as any;
    return quitCmd;
  }

  // deno-lint-ignore no-explicit-any
  static statementKey(options: any) {
    return (
      `${typeof options.nestTables}/${options.nestTables}/${options.rowsAsArray}${options.sql}`
    );
  }
  
}
