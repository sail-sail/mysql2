// deno-lint-ignore-file no-explicit-any
import { ConnectionConfig } from "./connection_config.ts";

class PoolConfig {
  
  connectionConfig: ConnectionConfig;
  waitForConnections: boolean;
  connectionLimit: number;
  queueLimit: number;
  
  constructor(options: any) {
    if (typeof options === 'string') {
      options = ConnectionConfig.parseUrl(options);
    }
    this.connectionConfig = new ConnectionConfig(options);
    this.waitForConnections =
      options.waitForConnections === undefined
        ? true
        : Boolean(options.waitForConnections);
    this.connectionLimit = isNaN(options.connectionLimit)
      ? 10
      : Number(options.connectionLimit);
    this.queueLimit = isNaN(options.queueLimit)
      ? 0
      : Number(options.queueLimit);
  }
}

export { PoolConfig }
