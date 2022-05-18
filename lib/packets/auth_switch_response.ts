import { Packet } from "./packet.ts";
import { Buffer } from "../../deps.ts";

// http://dev.mysql.com/doc/internals/en/connection-phase-packets.html#packet-Protocol::AuthSwitchRequest

export class AuthSwitchResponse {
  
  data: Buffer;
  
  constructor(data: string | Buffer | readonly number[]) {
    if (!Buffer.isBuffer(data)) {
      data = Buffer.from(data);
    }
    this.data = data;
  }

  toPacket() {
    const length = 4 + this.data.length;
    const buffer = Buffer.allocUnsafe(length);
    const packet = new Packet(0, buffer, 0, length);
    packet.offset = 4;
    packet.writeBuffer(this.data);
    return packet;
  }

  static fromPacket(packet: Packet) {
    const data = packet.readBuffer();
    return new AuthSwitchResponse(data);
  }
}
