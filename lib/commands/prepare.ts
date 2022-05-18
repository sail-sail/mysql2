import { Connection } from "../connection.ts";
import { ColumnDefinition } from "../packets/column_definition.ts";
import { Packet } from "../packets/packet.ts";
import { PreparedStatementHeader } from "../packets/prepared_statement_header.ts";
import { PrepareStatement } from "../packets/prepare_statement.ts";

import { Command } from "./command.ts"
import { CloseStatement } from "./close_statement.ts";
import { Execute } from "./execute.ts";

class PreparedStatementInfo {
  
  query: string;
  id: number;
  // deno-lint-ignore no-explicit-any
  columns: any[];
  // deno-lint-ignore no-explicit-any
  parameters: any[];
  // deno-lint-ignore no-explicit-any
  rowParser: any;
  _connection: Connection;
  
  // deno-lint-ignore no-explicit-any
  constructor(query: string, id: number, columns: any[], parameters: any[], connection: Connection) {
    this.query = query;
    this.id = id;
    this.columns = columns;
    this.parameters = parameters;
    this.rowParser = null;
    this._connection = connection;
  }

  close() {
    return this._connection.addCommand(new CloseStatement(this.id) as Command);
  }

  // deno-lint-ignore no-explicit-any
  execute(parameters: any[], callback: any) {
    if (typeof parameters === 'function') {
      callback = parameters;
      parameters = [];
    }
    return this._connection.addCommand(
      new Execute({ statement: this, values: parameters }, callback) as Command
    );
  }
}

class Prepare extends Command {
  
  id: number;
  fieldCount: number;
  parameterCount: number;
  // deno-lint-ignore no-explicit-any
  fields: any[];
  // deno-lint-ignore no-explicit-any
  parameterDefinitions: any[];
  // deno-lint-ignore no-explicit-any
  options: any;
  key: string|undefined;
  
  // deno-lint-ignore no-explicit-any
  constructor(options: any, callback: any) {
    super();
    this.query = options.sql;
    this.onResult = callback;
    this.id = 0;
    this.fieldCount = 0;
    this.parameterCount = 0;
    this.fields = [];
    this.parameterDefinitions = [];
    this.options = options;
  }

  start(_packet: Packet, connection: Connection) {
    // const Connection = connection.constructor;
    this.key = Connection.statementKey(this.options);
    const statement = connection._statements.get(this.key);
    if (statement) {
      if (this.onResult) {
        this.onResult(null, statement);
      }
      return null;
    }
    const cmdPacket = new PrepareStatement(
      this.query as string,
      connection.config.charsetNumber
    );
    connection.writePacket(cmdPacket.toPacket());
    return Prepare.prototype.prepareHeader;
  }

  prepareHeader(packet: Packet, connection: Connection) {
    const header = new PreparedStatementHeader(packet);
    this.id = header.id;
    this.fieldCount = header.fieldCount;
    this.parameterCount = header.parameterCount;
    if (this.parameterCount > 0) {
      return Prepare.prototype.readParameter;
    } if (this.fieldCount > 0) {
      return Prepare.prototype.readField;
    } 
    return this.prepareDone(connection);
    
  }

  readParameter(packet: Packet, connection: Connection) {
    const def = new ColumnDefinition(packet, connection.clientEncoding);
    this.parameterDefinitions.push(def);
    if (this.parameterDefinitions.length === this.parameterCount) {
      return Prepare.prototype.parametersEOF;
    }
    return this.readParameter;
  }

  readField(packet: Packet, connection: Connection) {
    const def = new ColumnDefinition(packet, connection.clientEncoding);
    this.fields.push(def);
    if (this.fields.length === this.fieldCount) {
      return Prepare.prototype.fieldsEOF;
    }
    return Prepare.prototype.readField;
  }

  parametersEOF(packet: Packet, connection: Connection) {
    if (!packet.isEOF()) {
      return connection.protocolError('Expected EOF packet after parameters');
    }
    if (this.fieldCount > 0) {
      return Prepare.prototype.readField;
    } 
    return this.prepareDone(connection);
    
  }

  fieldsEOF(packet: Packet, connection: Connection) {
    if (!packet.isEOF()) {
      return connection.protocolError('Expected EOF packet after fields');
    }
    return this.prepareDone(connection);
  }

  prepareDone(connection: Connection) {
    const statement = new PreparedStatementInfo(
      this.query as string,
      this.id,
      this.fields,
      this.parameterDefinitions,
      connection
    );
    connection._statements.set(this.key, statement);
    if (this.onResult) {
      this.onResult(null, statement);
    }
    return null;
  }
}

export { Prepare };
