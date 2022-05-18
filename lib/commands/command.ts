import { EventEmitter } from "../../deps.ts";
import { Connection } from "../connection.ts";
import { Packet } from "../packets/packet.ts";

export class Command extends EventEmitter {
  
  // deno-lint-ignore no-explicit-any
  start(..._args: any[]) {}
  // deno-lint-ignore no-explicit-any
  next: any;
  
  query?: string;
  sql?: string;
  
  // deno-lint-ignore no-explicit-any
  onResult?: (...args: any[]) => void;
  
  queryTimeout: number|null = null;
  
  _commandName?: string;
  
  constructor() {
    super();
    this.next = null;
  }

  // slow. debug only
  stateName() {
    const state = this.next;
    for (const i in this) {
      // deno-lint-ignore no-explicit-any
      if ((this[i] as any) === state && i !== 'next') {
        return i;
      }
    }
    return 'unknown name';
  }

  execute(packet: Packet, connection: Connection) {
    if (!this.next) {
      this.next = this.start;
      connection._resetSequenceId();
    }
    if (packet && packet.isError()) {
      const err = packet.asError(connection.clientEncoding);
      // deno-lint-ignore no-explicit-any
      (err as any).sql = this.sql || this.query;
      if (this.queryTimeout) {
        clearTimeout(this.queryTimeout);
        this.queryTimeout = null;
      }
      if (this.onResult) {
        this.onResult(err);
        this.emit('end');
      } else {
        this.emit('error', err);
        this.emit('end');
      }
      return true;
    }
    // TODO: don't return anything from execute, it's ugly and error-prone. Listen for 'end' event in connection
    this.next = this.next(packet, connection);
    if (this.next) {
      return false;
    } 
    this.emit('end');
    return true;
    
  }
}
