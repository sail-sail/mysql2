import { Connection } from "../connection.ts";
import { Packet } from "../packets/packet.ts";
import { Command } from './command.ts';
import { CloseStatement as PacketsCloseStatement } from '../packets/close_statement.ts';

class CloseStatement extends Command {
  
  id: number;
  
  constructor(id: number) {
    super();
    this.id = id;
  }

  start(_packet: Packet, connection: Connection) {
    connection.writePacket(new PacketsCloseStatement(this.id).toPacket());
    return null;
  }
}

export { CloseStatement };
