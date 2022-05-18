import { Buffer } from "../../deps.ts";

import { Packet } from "../packets/packet.ts";
import CommandCodes from "../constants/commands.ts";
import * as StringParser from '../parsers/string.ts';
import { charset_encodings as CharsetToEncoding } from '../constants/charset_encodings.ts';

class PrepareStatement {
  
  query: string;
  charsetNumber: number;
  encoding: string;
  
  constructor(sql: string, charsetNumber: number) {
    this.query = sql;
    this.charsetNumber = charsetNumber;
    this.encoding = CharsetToEncoding[charsetNumber];
  }

  toPacket() {
    const buf = StringParser.encode(this.query, this.encoding);
    const length = 5 + buf.length;
    const buffer = Buffer.allocUnsafe(length);
    const packet = new Packet(0, buffer, 0, length);
    packet.offset = 4;
    packet.writeInt8(CommandCodes.STMT_PREPARE);
    packet.writeBuffer(buf);
    return packet;
  }
}

export { PrepareStatement };
