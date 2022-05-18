// http://dev.mysql.com/doc/internals/en/com-binlog-dump.html#packet-COM_BINLOG_DUMP

import { Packet } from "../packets/packet.ts";
import CommandCodes from "../constants/commands.ts";
import { Buffer } from "../../deps.ts";

// TODO: add flag to constants
// 0x01 - BINLOG_DUMP_NON_BLOCK
// send EOF instead of blocking
class BinlogDump {
  
  binlogPos: number;
  serverId: number;
  flags: number;
  filename: string;
  
  // deno-lint-ignore no-explicit-any
  constructor(opts: any) {
    this.binlogPos = opts.binlogPos || 0;
    this.serverId = opts.serverId || 0;
    this.flags = opts.flags || 0;
    this.filename = opts.filename || '';
  }

  toPacket() {
    const length = 15 + Buffer.byteLength(this.filename, 'utf8'); // TODO: should be ascii?
    const buffer = Buffer.allocUnsafe(length);
    const packet = new Packet(0, buffer, 0, length);
    packet.offset = 4;
    packet.writeInt8(CommandCodes.BINLOG_DUMP);
    packet.writeInt32(this.binlogPos);
    packet.writeInt16(this.flags);
    packet.writeInt32(this.serverId);
    packet.writeString(this.filename);
    return packet;
  }
}

export { BinlogDump };
