// deno-lint-ignore-file
import BaseConnection from "./lib/Connection.d.ts";
import { ConnectionOptions, SslOptions} from './lib/Connection.d.ts';
import BasePoolConnection from "./lib/PoolConnection.d.ts"
import BasePool from "./lib/Pool.d.ts";
import {PoolOptions} from './lib/Pool.d.ts';
import BasePoolCluster from "./lib/PoolCluster.d.ts";
import {PoolClusterOptions} from './lib/PoolCluster.d.ts';
import BaseQuery from "./lib/protocol/sequences/Query.d.ts";
import {QueryOptions, StreamOptions, QueryError} from './lib/protocol/sequences/Query.d.ts';

export function createConnection(connectionUri: string): Connection;
export function createConnection(config: BaseConnection.ConnectionOptions): Connection;
export function createPool(config: BasePool.PoolOptions): Pool;
export function createPoolCluster(config?: BasePoolCluster.PoolClusterOptions): PoolCluster;
export function escape(value: any): string;
export function escapeId(value: any): string;
export function format(sql: string): string;
export function format(sql: string, values: any[], stringifyObjects?: boolean, timeZone?: string): string;
export function format(sql: string, values: any, stringifyObjects?: boolean, timeZone?: string): string;
export function raw(sql: string): {
    toSqlString: () => string
};

export {
    ConnectionOptions,
    SslOptions,
    PoolOptions,
    PoolClusterOptions,
    QueryOptions,
    QueryError
};
export * from './lib/protocol/packets/index.d.ts';

// Expose class interfaces
export interface Connection extends BaseConnection {}
export interface PoolConnection extends BasePoolConnection {}
export interface Pool extends BasePool {}
export interface PoolCluster extends BasePoolCluster {}
export interface Query extends BaseQuery {}
