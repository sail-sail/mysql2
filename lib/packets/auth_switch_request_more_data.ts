import { Packet } from "./packet.ts";
import { Buffer } from "../../deps.ts";

// http://dev.mysql.com/doc/internals/en/connection-phase-packets.html#packet-Protocol::AuthSwitchRequest

export class AuthSwitchRequestMoreData {
  
  data: Buffer;
  
  constructor(data: Buffer) {
    this.data = data;
  }

  toPacket() {
    const length = 5 + this.data.length;
    const buffer = Buffer.allocUnsafe(length);
    const packet = new Packet(0, buffer, 0, length);
    packet.offset = 4;
    packet.writeInt8(0x01);
    packet.writeBuffer(this.data);
    return packet;
  }

  static fromPacket(packet: Packet) {
    packet.readInt8(); // marker
    const data = packet.readBuffer();
    return new AuthSwitchRequestMoreData(data);
  }

  static verifyMarker(packet: Packet) {
    return packet.peekByte() === 0x01;
  }
}
