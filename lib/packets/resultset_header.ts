// TODO: rename to OK packet
// https://dev.mysql.com/doc/internals/en/packet-OK_Packet.html

import { Buffer } from "../../deps.ts";

import { Packet } from "../packets/packet.ts";
import * as ClientConstants from "../constants/client.ts";
import { SERVER_SESSION_STATE_CHANGED } from "../constants/server_status.ts";

import { charset_encodings as EncodingToCharset } from "../constants/charset_encodings.ts";
import * as sessionInfoTypes from "../constants/session_track.ts";
import { Connection } from "../connection.ts";

class ResultSetHeader {
  
  fieldCount: number;
  infileName: string | undefined;
  affectedRows: number | undefined;
  insertId: number | undefined;
  info: string|undefined|null;
  serverStatus: number|undefined;
  warningStatus: number|undefined;
  // deno-lint-ignore no-explicit-any
  stateChanges: any;
  changedRows: number | undefined;
  
  constructor(packet: Packet, connection: Connection) {
    const bigNumberStrings = connection.config.bigNumberStrings;
    const encoding = connection.serverEncoding;
    // deno-lint-ignore no-explicit-any
    const flags = (connection._handshakePacket as any).capabilityFlags;
    const isSet = function(flag: string) {
      // deno-lint-ignore no-explicit-any
      return flags & (ClientConstants as any)[flag];
    };
    if (packet.buffer[packet.offset] !== 0) {
      this.fieldCount = packet.readLengthCodedNumber() as number;
      if (this.fieldCount === null) {
        this.infileName = packet.readString(undefined, encoding);
      }
      return;
    }
    this.fieldCount = packet.readInt8(); // skip OK byte
    this.affectedRows = packet.readLengthCodedNumber(bigNumberStrings) as number;
    // deno-lint-ignore no-explicit-any
    this.insertId = packet.readLengthCodedNumberSigned((bigNumberStrings as any)) as number;
    this.info = '';
    if (isSet('PROTOCOL_41')) {
      this.serverStatus = packet.readInt16();
      this.warningStatus = packet.readInt16();
    } else if (isSet('TRANSACTIONS')) {
      this.serverStatus = packet.readInt16();
    }
    let stateChanges = null;
    if (isSet('SESSION_TRACK') && packet.offset < packet.end) {
      this.info = packet.readLengthCodedString(encoding);

      if (this.serverStatus && SERVER_SESSION_STATE_CHANGED) {
        // session change info record - see
        // https://dev.mysql.com/doc/internals/en/packet-OK_Packet.html#cs-sect-packet-ok-sessioninfo
        let len =
          packet.offset < packet.end ? packet.readLengthCodedNumber() as number : 0;
        const end = (packet.offset as number) + len;
        let type, key, stateEnd;
        if (len > 0) {
          stateChanges = {
            // deno-lint-ignore no-explicit-any
            systemVariables: {} as any,
            schema: null,
            trackStateChange: null
          // deno-lint-ignore no-explicit-any
          } as any;
        }
        while (packet.offset < end) {
          type = packet.readInt8();
          len = packet.readLengthCodedNumber() as number;
          stateEnd = packet.offset + len;
          if (type === sessionInfoTypes.SYSTEM_VARIABLES) {
            key = packet.readLengthCodedString(encoding);
            const val = packet.readLengthCodedString(encoding);
            stateChanges.systemVariables[key as string] = val;
            if (key === 'character_set_client') {
              // deno-lint-ignore no-explicit-any
              const charsetNumber = EncodingToCharset[val as any];
              // deno-lint-ignore no-explicit-any
              connection.config.charsetNumber = charsetNumber as any;
            }
          } else if (type === sessionInfoTypes.SCHEMA) {
            key = packet.readLengthCodedString(encoding);
            stateChanges.schema = key;
          } else if (type === sessionInfoTypes.STATE_CHANGE) {
            stateChanges.trackStateChange = packet.readLengthCodedString(
              encoding
            );
          } else {
            // unsupported session track type. For now just ignore
          }
          packet.offset = stateEnd;
        }
      }
    } else {
      this.info = packet.readString(undefined, encoding);
    }
    if (stateChanges) {
      this.stateChanges = stateChanges;
    }
    const m = (this.info as string).match(/\schanged:\s*(\d+)/i);
    if (m !== null) {
      this.changedRows = parseInt(m[1], 10);
    }
  }

  // TODO: should be consistent instance member, but it's just easier here to have just function
  static toPacket(fieldCount: number, insertId?: number) {
    let length = 4 + Packet.lengthCodedNumberLength(fieldCount);
    if (typeof insertId !== 'undefined') {
      length += Packet.lengthCodedNumberLength(insertId);
    }
    const buffer = Buffer.allocUnsafe(length);
    const packet = new Packet(0, buffer, 0, length);
    packet.offset = 4;
    packet.writeLengthCodedNumber(fieldCount);
    if (typeof insertId !== 'undefined') {
      packet.writeLengthCodedNumber(insertId);
    }
    return packet;
  }
}

export { ResultSetHeader };
