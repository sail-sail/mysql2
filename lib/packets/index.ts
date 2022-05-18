import { Buffer } from "../../deps.ts";
import { Packet } from "./packet.ts";

class OK {
  // deno-lint-ignore no-explicit-any
  static toPacket(args?: any, encoding?: string) {
    args = args || {};
    const affectedRows = args.affectedRows || 0;
    const insertId = args.insertId || 0;
    const serverStatus = args.serverStatus || 0;
    const warningCount = args.warningCount || 0;
    const message = args.message || '';

    let length = 9 + Packet.lengthCodedNumberLength(affectedRows);
    length += Packet.lengthCodedNumberLength(insertId);

    const buffer = Buffer.allocUnsafe(length);
    const packet = new Packet(0, buffer, 0, length);
    packet.offset = 4;
    packet.writeInt8(0);
    packet.writeLengthCodedNumber(affectedRows);
    packet.writeLengthCodedNumber(insertId);
    packet.writeInt16(serverStatus);
    packet.writeInt16(warningCount);
    packet.writeString(message, encoding);
    packet._name = 'OK';
    return packet;
  }
}

export { OK };

// warnings, statusFlags
class EOF {
  static toPacket(warnings?: number, statusFlags?: number) {
    if (typeof warnings === 'undefined') {
      warnings = 0;
    }
    if (typeof statusFlags === 'undefined') {
      statusFlags = 0;
    }
    const packet = new Packet(0, Buffer.allocUnsafe(9), 0, 9);
    packet.offset = 4;
    packet.writeInt8(0xfe);
    packet.writeInt16(warnings);
    packet.writeInt16(statusFlags);
    packet._name = 'EOF';
    return packet;
  }
}

export { EOF };

class Error {
  
  message?: string;
  code?: number;
  
  // deno-lint-ignore no-explicit-any
  static toPacket(args: any, encoding?: string) {
    const length = 13 + Buffer.byteLength(args.message, 'utf8');
    const packet = new Packet(0, Buffer.allocUnsafe(length), 0, length);
    packet.offset = 4;
    packet.writeInt8(0xff);
    packet.writeInt16(args.code);
    // TODO: sql state parameter
    packet.writeString('#_____', encoding);
    packet.writeString(args.message, encoding);
    packet._name = 'Error';
    return packet;
  }

  static fromPacket(packet: Packet) {
    packet.readInt8(); // marker
    const code = packet.readInt16();
    packet.readString(1, 'ascii'); // sql state marker
    // The SQL state of the ERR_Packet which is always 5 bytes long.
    // https://dev.mysql.com/doc/dev/mysql-server/8.0.11/page_protocol_basic_dt_strings.html#sect_protocol_basic_dt_string_fix
    packet.readString(5, 'ascii'); // sql state (ignore for now)
    const message = packet.readNullTerminatedString('utf8');
    const error = new Error();
    // deno-lint-ignore no-explicit-any
    (error as any).message = message;
    // deno-lint-ignore no-explicit-any
    (error as any).code = code;
    return error;
  }
}

export { Error };
