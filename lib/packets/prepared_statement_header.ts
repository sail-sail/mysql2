import { Packet } from "./packet.ts";

class PreparedStatementHeader {
  
  id: number;
  fieldCount: number;
  parameterCount: number;
  warningCount: number;
  
  constructor(packet: Packet) {
    packet.skip(1); // should be 0
    this.id = packet.readInt32();
    this.fieldCount = packet.readInt16();
    this.parameterCount = packet.readInt16();
    packet.skip(1); // should be 0
    this.warningCount = packet.readInt16();
  }
}

// TODO: toPacket

export { PreparedStatementHeader };
