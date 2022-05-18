import { Packet } from "../packets/packet.ts";
import { Buffer } from "../../deps.ts";

class TextRow {
  
  columns: string[];
  
  constructor(columns?: string[]) {
    this.columns = columns || [];
  }

  static fromPacket(packet: Packet) {
    // packet.reset(); // set offset to starting point?
    const columns: string[] = [];
    while (packet.haveMoreData()) {
      columns.push(packet.readLengthCodedString() as string);
    }
    return new TextRow(columns);
  }

  static toPacket(columns: string[], encoding?: string) {
    const sequenceId = 0; // TODO remove, this is calculated now in connecton
    let length = 0;
    columns.forEach(val => {
      if (val === null || typeof val === 'undefined') {
        ++length;
        return;
      }
      length += Packet.lengthCodedStringLength(val.toString(), encoding);
    });
    const buffer = Buffer.allocUnsafe(length + 4);
    const packet = new Packet(sequenceId, buffer, 0, length + 4);
    packet.offset = 4;
    columns.forEach(val => {
      if (val === null) {
        packet.writeNull();
        return;
      }
      if (typeof val === 'undefined') {
        packet.writeInt8(0);
        return;
      }
      packet.writeLengthCodedString(val.toString(), encoding);
    });
    return packet;
  }
}

export { TextRow };
