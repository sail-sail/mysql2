
import Connection from "./Connection.d.ts";

declare class PoolConnection extends Connection {
    connection: Connection;
    release(): void;
}

export = PoolConnection;
