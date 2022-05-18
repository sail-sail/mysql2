// @deno-types="./index.d.ts"
import { sqlstring as SqlString } from "./deps.ts";

import { Connection } from "./lib/connection.ts";
import { ConnectionConfig } from "./lib/connection_config.ts";
import * as parserCache from "./lib/parsers/parser_cache.ts"

// deno-lint-ignore no-explicit-any
export function createConnection(opts: any) {
  // deno-lint-ignore no-explicit-any
  return new Connection({ config: new ConnectionConfig(opts) as any });
}

export const connect = createConnection;
export { Connection };
export { ConnectionConfig };

import { Pool } from "./lib/pool.ts";
import { PoolCluster } from "./lib/pool_cluster.ts";
import { PoolConfig } from "./lib/pool_config.ts";
import { Server } from "./lib/server.ts";

// deno-lint-ignore no-explicit-any
export function createPool(config: any) {
  return new Pool({ config: new PoolConfig(config) });
}

// deno-lint-ignore no-explicit-any
export function createPoolCluster(config: any) {
  return new PoolCluster(config);
}

export const createQuery = Connection.createQuery;

export { Pool };

export { PoolCluster };

// deno-lint-ignore no-explicit-any
export function createServer(handler: any) {
  // const Server = require('./lib/server.js');
  const s = new Server();
  if (handler) {
    s.on('connection', handler);
  }
  return s;
}

export { PoolConnection } from "./lib/pool_connection.ts";

// exports.PoolConnection = require('./lib/pool_connection');
export const escape = SqlString.escape;
export const escapeId = SqlString.escapeId;
export const format = SqlString.format;
export const raw = SqlString.raw;

export {
  createConnection as createConnectionPromise,
  createPool as createPoolPromise,
  createPoolCluster as createPoolClusterPromise,
} from "./promise.ts";

import * as Types from "./lib/constants/types.ts";
export { Types };

import * as Charsets from "./lib/constants/charsets.ts";
export { Charsets };

export { charset_encodings as CharsetToEncoding } from "./lib/constants/charset_encodings.ts";

export function setMaxParserCache(max: number) {
  parserCache.setMaxCache(max);
}

export function clearParserCache() {
  parserCache.clearCache();
}
