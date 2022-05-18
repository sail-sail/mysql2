'use strict';

import * as ClientConstants from '../constants/client.ts';
import { charset_encodings as CharsetToEncoding } from '../constants/charset_encodings.ts';
import { Packet } from '../packets/packet.ts';

import * as auth41 from '../auth_41.ts';
import { Buffer } from '../../deps.ts';

class HandshakeResponse {
  
  user: string;
  database: string;
  password: string;
  passwordSha1: string;
  authPluginData1: Buffer;
  authPluginData2: Buffer;
  compress: boolean;
  clientFlags: number;
  authToken: Buffer;
  charsetNumber: number;
  encoding: string;
  // deno-lint-ignore no-explicit-any
  connectAttributes: any;
  
  // deno-lint-ignore no-explicit-any
  constructor(handshake: any) {
    this.user = handshake.user || '';
    this.database = handshake.database || '';
    this.password = handshake.password || '';
    this.passwordSha1 = handshake.passwordSha1;
    this.authPluginData1 = handshake.authPluginData1;
    this.authPluginData2 = handshake.authPluginData2;
    this.compress = handshake.compress;
    this.clientFlags = handshake.flags;
    // TODO: pre-4.1 auth support
    let authToken;
    if (this.passwordSha1) {
      authToken = auth41.calculateTokenFromPasswordSha(
        this.passwordSha1,
        this.authPluginData1,
        this.authPluginData2
      );
    } else {
      authToken = auth41.calculateToken(
        this.password,
        this.authPluginData1,
        this.authPluginData2
      );
    }
    this.authToken = authToken;
    this.charsetNumber = handshake.charsetNumber;
    this.encoding = CharsetToEncoding[handshake.charsetNumber];
    this.connectAttributes = handshake.connectAttributes;
  }

  serializeResponse(buffer: Buffer) {
    // deno-lint-ignore no-explicit-any
    const isSet = (flag: string) => this.clientFlags & (ClientConstants as any)[flag];
    const packet = new Packet(0, buffer, 0, buffer.length);
    packet.offset = 4;
    packet.writeInt32(this.clientFlags);
    packet.writeInt32(0); // max packet size. todo: move to config
    packet.writeInt8(this.charsetNumber);
    packet.skip(23);
    const encoding = this.encoding;
    packet.writeNullTerminatedString(this.user, encoding);
    let k;
    if (isSet('PLUGIN_AUTH_LENENC_CLIENT_DATA')) {
      packet.writeLengthCodedNumber(this.authToken.length);
      packet.writeBuffer(this.authToken);
    } else if (isSet('SECURE_CONNECTION')) {
      packet.writeInt8(this.authToken.length);
      packet.writeBuffer(this.authToken);
    } else {
      packet.writeBuffer(this.authToken);
      packet.writeInt8(0);
    }
    if (isSet('CONNECT_WITH_DB')) {
      packet.writeNullTerminatedString(this.database, encoding);
    }
    if (isSet('PLUGIN_AUTH')) {
      // TODO: pass from config
      packet.writeNullTerminatedString('mysql_native_password', 'latin1');
    }
    if (isSet('CONNECT_ATTRS')) {
      const connectAttributes = this.connectAttributes || {};
      const attrNames = Object.keys(connectAttributes);
      let keysLength = 0;
      for (k = 0; k < attrNames.length; ++k) {
        keysLength += Packet.lengthCodedStringLength(attrNames[k], encoding);
        keysLength += Packet.lengthCodedStringLength(
          connectAttributes[attrNames[k]],
          encoding
        );
      }
      packet.writeLengthCodedNumber(keysLength);
      for (k = 0; k < attrNames.length; ++k) {
        packet.writeLengthCodedString(attrNames[k], encoding);
        packet.writeLengthCodedString(
          connectAttributes[attrNames[k]],
          encoding
        );
      }
    }
    return packet;
  }

  toPacket() {
    if (typeof this.user !== 'string') {
      throw new Error('"user" connection config property must be a string');
    }
    if (typeof this.database !== 'string') {
      throw new Error('"database" connection config property must be a string');
    }
    // dry run: calculate resulting packet length
    const p = this.serializeResponse(Packet.MockBuffer());
    return this.serializeResponse(Buffer.alloc(p.offset));
  }
  static fromPacket(packet: Packet) {
    const args: {
      user?: string;
      database?: string;
      password?: string;
      passwordSha1?: string;
      authPluginData1?: Buffer;
      authPluginData2?: Buffer;
      compress?: boolean;
      clientFlags?: number;
      authToken?: Buffer|string;
      charsetNumber?: number;
      encoding?: string;
      // deno-lint-ignore no-explicit-any
      connectAttributes?: any;
      maxPacketSize?: number;
      authPluginName?: string;
    } = {};
    args.clientFlags = packet.readInt32();
    function isSet(flag: string) {
      // deno-lint-ignore no-explicit-any
      return (args.clientFlags as number) & ((ClientConstants as any)[flag] as number);
    }
    args.maxPacketSize = packet.readInt32();
    args.charsetNumber = packet.readInt8();
    const encoding = CharsetToEncoding[args.charsetNumber];
    args.encoding = encoding;
    packet.skip(23);
    args.user = packet.readNullTerminatedString(encoding);
    let authTokenLength: number|undefined;
    if (isSet('PLUGIN_AUTH_LENENC_CLIENT_DATA')) {
      // deno-lint-ignore no-explicit-any
      authTokenLength = packet.readLengthCodedNumber(<any>encoding) as number;
      args.authToken = packet.readBuffer(authTokenLength);
    } else if (isSet('SECURE_CONNECTION')) {
      authTokenLength = packet.readInt8();
      args.authToken = packet.readBuffer(authTokenLength);
    } else {
      args.authToken = packet.readNullTerminatedString(encoding);
    }
    if (isSet('CONNECT_WITH_DB')) {
      args.database = packet.readNullTerminatedString(encoding);
    }
    if (isSet('PLUGIN_AUTH')) {
      args.authPluginName = packet.readNullTerminatedString(encoding);
    }
    if (isSet('CONNECT_ATTRS')) {
      // deno-lint-ignore no-explicit-any
      const keysLength = packet.readLengthCodedNumber(<any>encoding) as number;
      const keysEnd = packet.offset + keysLength;
      // deno-lint-ignore no-explicit-any
      const attrs: any = {};
      while (packet.offset < keysEnd) {
        attrs[
          packet.readLengthCodedString(encoding) as string
        ] = packet.readLengthCodedString(encoding);
      }
      args.connectAttributes = attrs;
    }
    return args;
  }
}

export { HandshakeResponse };
