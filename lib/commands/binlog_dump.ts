import { Connection } from "../connection.ts";
import { Packet } from "../packets/packet.ts";
import { Command } from "./command.ts";
import { BinlogDump as PacketsBinlogDump } from "../packets/binlog_dump.ts";
import { Buffer } from "../../deps.ts";
import { parseStatusVars } from "../packets/binlog_query_statusvars.ts";

// deno-lint-ignore no-explicit-any
const eventParsers: any[] = [];

class BinlogEventHeader {
  
  timestamp: number;
  eventType: number;
  serverId: number;
  eventSize: number;
  logPos: number;
  flags: number;
  
  constructor(packet: Packet) {
    this.timestamp = packet.readInt32();
    this.eventType = packet.readInt8();
    this.serverId = packet.readInt32();
    this.eventSize = packet.readInt32();
    this.logPos = packet.readInt32();
    this.flags = packet.readInt16();
  }
}

class BinlogDump extends Command {
  
  // deno-lint-ignore no-explicit-any
  opts: any;
  
  // deno-lint-ignore no-explicit-any
  constructor(opts: any, _callback: any) {
    super();
    // this.onResult = callback;
    this.opts = opts;
  }

  start(_packet: Packet, connection: Connection) {
    const newPacket = new PacketsBinlogDump(this.opts);
    connection.writePacket(newPacket.toPacket());
    return BinlogDump.prototype.binlogData;
  }

  binlogData(packet: Packet) {
    // ok - continue consuming events
    // error - error
    // eof - end of binlog
    if (packet.isEOF()) {
      this.emit('eof');
      return null;
    }
    // binlog event header
    packet.readInt8();
    const header = new BinlogEventHeader(packet);
    const EventParser = eventParsers[header.eventType];
    let event;
    if (EventParser) {
      event = new EventParser(packet);
    } else {
      event = {
        name: 'UNKNOWN'
      };
    }
    event.header = header;
    this.emit('event', event);
    return BinlogDump.prototype.binlogData;
  }
}

class RotateEvent {
  
  pposition: number;
  nextBinlog: string;
  name: string;
  
  constructor(packet: Packet) {
    this.pposition = packet.readInt32();
    // TODO: read uint64 here
    packet.readInt32(); // positionDword2
    this.nextBinlog = packet.readString();
    this.name = 'RotateEvent';
  }
}

class FormatDescriptionEvent {
  
  binlogVersion: number;
  serverVersion: string;
  createTimestamp: number;
  eventHeaderLength: number;
  eventsLength: Buffer;
  name: string;
  
  constructor(packet: Packet) {
    this.binlogVersion = packet.readInt16();
    // deno-lint-ignore no-control-regex
    this.serverVersion = packet.readString(50).replace(/\u0000.*/, ''); // eslint-disable-line no-control-regex
    this.createTimestamp = packet.readInt32();
    this.eventHeaderLength = packet.readInt8(); // should be 19
    this.eventsLength = packet.readBuffer();
    this.name = 'FormatDescriptionEvent';
  }
}

class QueryEvent {
  
  slaveProxyId: number;
  executionTime: number;
  errorCode: number;
  schema: string;
  // deno-lint-ignore no-explicit-any
  statusVars: any;
  query: string;
  name: string;
  
  constructor(packet: Packet) {
    this.slaveProxyId = packet.readInt32();
    this.executionTime = packet.readInt32();
    const schemaLength = packet.readInt8();
    this.errorCode = packet.readInt16();
    const statusVarsLength = packet.readInt16();
    const statusVars = packet.readBuffer(statusVarsLength);
    this.schema = packet.readString(schemaLength);
    packet.readInt8(); // should be zero
    this.statusVars = parseStatusVars(statusVars);
    this.query = packet.readString();
    this.name = 'QueryEvent';
  }
}

class XidEvent {
  
  binlogVersion: number;
  xid: string|number;
  name: string;
  
  constructor(packet: Packet) {
    this.binlogVersion = packet.readInt16();
    this.xid = packet.readInt64();
    this.name = 'XidEvent';
  }
}

eventParsers[2] = QueryEvent;
eventParsers[4] = RotateEvent;
eventParsers[15] = FormatDescriptionEvent;
eventParsers[16] = XidEvent;

export { BinlogDump };
