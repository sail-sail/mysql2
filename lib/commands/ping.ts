import { Command } from './command.ts';
import CommandCode from '../constants/commands.ts';
import { Packet } from '../packets/packet.ts';
import { Buffer } from '../../deps.ts';
import { Connection } from "../connection.ts";

// TODO: time statistics?
// usefull for queue size and network latency monitoring
// store created,sent,reply timestamps
class Ping extends Command {
  // deno-lint-ignore no-explicit-any
  constructor(callback: any) {
    super();
    this.onResult = callback;
  }

  start(_packet: Packet, connection: Connection) {
    const ping = new Packet(
      0,
      Buffer.from([1, 0, 0, 0, CommandCode.PING]),
      0,
      5
    );
    connection.writePacket(ping);
    return Ping.prototype.pingResponse;
  }

  pingResponse() {
    // TODO: check it's OK packet. error check already done in caller
    if (this.onResult) {
      this.onResult.bind(this);
    }
    return null;
  }
}

export { Ping };