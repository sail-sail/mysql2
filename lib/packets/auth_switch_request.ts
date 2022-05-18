// http://dev.mysql.com/doc/internals/en/connection-phase-packets.html#packet-Protocol::AuthSwitchRequest
import { Buffer } from "../../deps.ts";
import { Packet } from "./packet.ts"

export class AuthSwitchRequest {
  
  pluginName: string;
  pluginData: Buffer;
  
  constructor(opts: {
    pluginName: string,
    pluginData: Buffer,
  }) {
    this.pluginName = opts.pluginName;
    this.pluginData = opts.pluginData;
  }

  toPacket() {
    const length = 6 + this.pluginName.length + this.pluginData.length;
    const buffer = Buffer.allocUnsafe(length);
    const packet = new Packet(0, buffer, 0, length);
    packet.offset = 4;
    packet.writeInt8(0xfe);
    // TODO: use server encoding
    packet.writeNullTerminatedString(this.pluginName, 'cesu8');
    packet.writeBuffer(this.pluginData);
    return packet;
  }

  static fromPacket(packet: Packet) {
    packet.readInt8(); // marker
    // assert marker == 0xfe?
    // TODO: use server encoding
    const name = packet.readNullTerminatedString('cesu8');
    const data = packet.readBuffer();
    return new AuthSwitchRequest({
      pluginName: name,
      pluginData: data
    });
  }
}
