import { Packet } from "../packets/packet.ts";
import CommandCodes from "../constants/commands.ts";
import { Buffer } from "../../deps.ts";

class CloseStatement {
  
  id: number;
  
  constructor(id: number) {
    this.id = id;
  }

  // note: no response sent back
  toPacket() {
    const packet = new Packet(0, Buffer.allocUnsafe(9), 0, 9);
    packet.offset = 4;
    packet.writeInt8(CommandCodes.STMT_CLOSE);
    packet.writeInt32(this.id);
    return packet;
  }
}

export { CloseStatement };
