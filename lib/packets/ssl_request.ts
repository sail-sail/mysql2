import * as ClientConstants from "../constants/client.ts";
import { Packet } from "../packets/packet.ts";
import { Buffer } from "../../deps.ts";

class SSLRequest {
  
  clientFlags: number;
  charset: number;
  
  constructor(flags: number, charset: number) {
    this.clientFlags = flags | ClientConstants.SSL;
    this.charset = charset;
  }

  toPacket() {
    const length = 36;
    const buffer = Buffer.allocUnsafe(length);
    const packet = new Packet(0, buffer, 0, length);
    buffer.fill(0);
    packet.offset = 4;
    packet.writeInt32(this.clientFlags);
    packet.writeInt32(0); // max packet size. todo: move to config
    packet.writeInt8(this.charset);
    return packet;
  }
}

export { SSLRequest };
