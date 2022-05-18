import {
  createServer,
  EventEmitter,
} from "../deps.ts";
import { Connection } from "./connection.ts";
import { ConnectionConfig } from "./connection_config.ts";

// TODO: inherit Server from net.Server
class Server extends EventEmitter {
  
  connections: Connection[];
  _server: ReturnType<typeof createServer>;
  _port: number|undefined;
  
  constructor() {
    super();
    this.connections = [];
    // deno-lint-ignore no-explicit-any
    this._server = createServer(this._handleConnection.bind(this) as any);
  }

  // deno-lint-ignore no-explicit-any
  _handleConnection(socket: any) {
    const connectionConfig = new ConnectionConfig({
      stream: socket,
      isServer: true
    });
    const connection = new Connection({ config: connectionConfig });
    this.emit('connection', connection);
  }

  listen(port: number) {
    this._port = port;
    // deno-lint-ignore no-explicit-any
    this._server.listen.apply(this._server, arguments as any);
    return this;
  }

  // deno-lint-ignore no-explicit-any
  close(cb: any) {
    this._server.close(cb);
  }
}

export { Server }
