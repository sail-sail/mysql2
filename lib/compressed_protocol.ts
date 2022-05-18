// connection mixins
// implementation of http://dev.mysql.com/doc/internals/en/compression.html

import {
  zlib,
  Buffer,
  seq_queue as seqqueue,
} from "../deps.ts";
import { Packet } from "./packets/packet.ts";
import { PacketParser } from "./packet_parser.ts";

// deno-lint-ignore no-explicit-any
function handleCompressedPacket(_this: any, packet: Packet) {
  // deno-lint-ignore no-explicit-any
  const connection: any = _this;
  const deflatedLength = packet.readInt24();
  const body = packet.readBuffer();

  if (deflatedLength !== 0) {
    // deno-lint-ignore no-explicit-any
    connection.inflateQueue.push((task: any) => {
      zlib.inflate(body, (err: Error, data: Buffer) => {
        if (err) {
          connection._handleNetworkError(err);
          return;
        }
        connection._bumpCompressedSequenceId(packet.numPackets);
        connection._inflatedPacketsParser.execute(data);
        task.done();
      });
    });
  } else {
    // deno-lint-ignore no-explicit-any
    connection.inflateQueue.push((task: any) => {
      connection._bumpCompressedSequenceId(packet.numPackets);
      connection._inflatedPacketsParser.execute(body);
      task.done();
    });
  }
}

// deno-lint-ignore no-explicit-any
function writeCompressed(this: any, buffer: Buffer) {
  // http://dev.mysql.com/doc/internals/en/example-several-mysql-packets.html
  // note: sending a MySQL Packet of the size 2^24−5 to 2^24−1 via compression
  // leads to at least one extra compressed packet.
  // (this is because "length of the packet before compression" need to fit
  // into 3 byte unsigned int. "length of the packet before compression" includes
  // 4 byte packet header, hence 2^24−5)
  const MAX_COMPRESSED_LENGTH = 16777210;
  let start;
  if (buffer.length > MAX_COMPRESSED_LENGTH) {
    for (start = 0; start < buffer.length; start += MAX_COMPRESSED_LENGTH) {
      writeCompressed.call(
        // deno-lint-ignore no-explicit-any
        this as any,
        buffer.slice(start, start + MAX_COMPRESSED_LENGTH)
      );
    }
    return;
  }

  // eslint-disable-next-line no-invalid-this, consistent-this no-this-alias
  // deno-lint-ignore no-explicit-any
  const connection = <any> this;

  let packetLen = buffer.length;
  const compressHeader = Buffer.allocUnsafe(7);

  // seqqueue is used here because zlib async execution is routed via thread pool
  // internally and when we have multiple compressed packets arriving we need
  // to assemble uncompressed result sequentially
  (function(seqId) {
    // deno-lint-ignore no-explicit-any
    connection.deflateQueue.push((task: any) => {
      zlib.deflate(buffer, (err: Error, compressed: Buffer) => {
        if (err) {
          connection._handleFatalError(err);
          return;
        }
        let compressedLength = compressed.length;

        if (compressedLength < packetLen) {
          compressHeader.writeUInt8(compressedLength & 0xff, 0);
          compressHeader.writeUInt16LE(compressedLength >> 8, 1);
          compressHeader.writeUInt8(seqId, 3);
          compressHeader.writeUInt8(packetLen & 0xff, 4);
          compressHeader.writeUInt16LE(packetLen >> 8, 5);
          connection.writeUncompressed(compressHeader);
          connection.writeUncompressed(compressed);
        } else {
          // http://dev.mysql.com/doc/internals/en/uncompressed-payload.html
          // To send an uncompressed payload:
          //   - set length of payload before compression to 0
          //   - the compressed payload contains the uncompressed payload instead.
          compressedLength = packetLen;
          packetLen = 0;
          compressHeader.writeUInt8(compressedLength & 0xff, 0);
          compressHeader.writeUInt16LE(compressedLength >> 8, 1);
          compressHeader.writeUInt8(seqId, 3);
          compressHeader.writeUInt8(packetLen & 0xff, 4);
          compressHeader.writeUInt16LE(packetLen >> 8, 5);
          connection.writeUncompressed(compressHeader);
          connection.writeUncompressed(buffer);
        }
        task.done();
      });
    });
  })(connection.compressedSequenceId);
  connection._bumpCompressedSequenceId(1);
}

// deno-lint-ignore no-explicit-any
function enableCompression(connection: any) {
  connection._lastWrittenPacketId = 0;
  connection._lastReceivedPacketId = 0;

  // deno-lint-ignore no-explicit-any
  connection._handleCompressedPacket = function(...args: any[]) {
    args.unshift(this);
    // deno-lint-ignore no-explicit-any
    return handleCompressedPacket.apply(this, args as any);
  };
  connection._inflatedPacketsParser = new PacketParser((p) => {
    connection.handlePacket(p);
  }, 4);
  connection._inflatedPacketsParser._lastPacket = 0;
  connection.packetParser = new PacketParser((packet) => {
    connection._handleCompressedPacket(packet);
  }, 7);

  connection.writeUncompressed = connection.write;
  connection.write = writeCompressed;

  connection.inflateQueue = seqqueue.createQueue();
  connection.deflateQueue = seqqueue.createQueue();
}

export {
  enableCompression,
};
