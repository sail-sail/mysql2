import { Connection } from "../connection.ts";
import { Packet } from "../packets/packet.ts";
import { Command } from "./command.ts";
import CommandCode from "../constants/commands.ts";
import { Buffer } from "../../deps.ts";

class Quit extends Command {
  
  // deno-lint-ignore no-explicit-any
  done: any;
  
  // deno-lint-ignore no-explicit-any
  constructor(callback: any) {
    super();
    this.done = callback;
  }

  start(_packet: Packet, connection: Connection) {
    connection._closing = true;
    const quit = new Packet(
      0,
      Buffer.from([1, 0, 0, 0, CommandCode.QUIT]),
      0,
      5
    );
    if (this.done) {
      this.done();
    }
    connection.writePacket(quit);
    return null;
  }
}

export { Quit };
