// const Packet = require('../packets/packet.js');
// const CommandCode = require('../constants/commands.js');
// const StringParser = require('../parsers/string.js');
// const CharsetToEncoding = require('../constants/charset_encodings.js');

import { Packet } from "./packet.ts";
import CommandCode from "../constants/commands.ts";
import { Buffer } from "../../deps.ts";
import * as StringParser from "../parsers/string.ts";
import { charset_encodings as CharsetToEncoding } from "../constants/charset_encodings.ts";

class Query {
  
  encoding: string;
  charsetNumber: number;
  query: string;
  
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
    packet.writeInt8(CommandCode.QUERY);
    packet.writeBuffer(buf);
    return packet;
  }
}

export { Query };
