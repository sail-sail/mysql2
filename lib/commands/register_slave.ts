import { Connection } from "../connection.ts";
import { Packet } from "../packets/packet.ts";
import { Command } from "./command.ts";
import { RegisterSlave as PacketsRegisterSlave } from "../packets/register_slave.ts";

class RegisterSlave extends Command {
  
  // deno-lint-ignore no-explicit-any
  opts: any;
  
  // deno-lint-ignore no-explicit-any
  constructor(opts: any, callback: any) {
    super();
    this.onResult = callback;
    this.opts = opts;
  }

  start(_packet: Packet, connection: Connection) {
    const newPacket = new PacketsRegisterSlave(this.opts);
    connection.writePacket(newPacket.toPacket());
    return RegisterSlave.prototype.registerResponse;
  }

  registerResponse() {
    if (this.onResult) {
      // process.nextTick(this.onResult.bind(this));
      this.onResult.bind(this);
    }
    return null;
  }
}

export { RegisterSlave };
