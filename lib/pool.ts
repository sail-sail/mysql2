// @deno-types="../typings/mysql/lib/Pool.d.ts"
// deno-lint-ignore-file no-explicit-any
import { format, escapeId, escape } from "../index.ts";

import { EventEmitter, Denque as Queue, nextTick } from "../deps.ts";
import { PoolConnection } from "./pool_connection.ts";
import { Connection } from "./connection.ts";
import { PromisePool } from "../promise.ts";

function spliceConnection(queue: Queue, connection: Connection) {
  const len = queue.length;
  for (let i = 0; i < len; i++) {
    if (queue.get(i) === connection) {
      queue.removeOne(i);
      break;
    }
  }
}

class Pool extends EventEmitter {
  
  config: any;
  _allConnections: Queue<any>;
  _freeConnections: Queue<any>;
  _connectionQueue: Queue<any>;
  _closed: boolean;
  
  constructor(options: any) {
    super();
    this.config = options.config;
    this.config.connectionConfig.pool = this;
    this._allConnections = new Queue();
    this._freeConnections = new Queue();
    this._connectionQueue = new Queue();
    this._closed = false;
  }

  promise(promiseImpl: any) {
    // const PromisePool = require('../promise').PromisePool;
    return new PromisePool(this, promiseImpl);
  }

  getConnection(cb: any) {
    if (this._closed) {
      return nextTick(() => cb(new Error('Pool is closed.')));
    }
    let connection: Connection;
    if (this._freeConnections.length > 0) {
      connection = this._freeConnections.shift();
      this.emit('acquire', connection);
      return nextTick(() => cb(null, connection));
    }
    if (
      this.config.connectionLimit === 0 ||
      this._allConnections.length < this.config.connectionLimit
    ) {
      connection = new PoolConnection(this, {
        config: this.config.connectionConfig
      });
      this._allConnections.push(connection);
      return connection.connect((err: Error) => {
        if (this._closed) {
          return cb(new Error('Pool is closed.'));
        }
        if (err) {
          return cb(err);
        }
        this.emit('connection', connection);
        this.emit('acquire', connection);
        return cb(null, connection);
      });
    }
    if (!this.config.waitForConnections) {
      return nextTick(() => cb(new Error('No connections available.')));
    }
    if (
      this.config.queueLimit &&
      this._connectionQueue.length >= this.config.queueLimit
    ) {
      return cb(new Error('Queue limit reached.'));
    }
    this.emit('enqueue');
    return this._connectionQueue.push(cb);
  }

  releaseConnection(connection: PoolConnection) {
    let cb;
    if (!connection._pool) {
      // The connection has been removed from the pool and is no longer good.
      if (this._connectionQueue.length) {
        cb = this._connectionQueue.shift();
        nextTick(this.getConnection.bind(this, cb));
      }
    } else if (this._connectionQueue.length) {
      cb = this._connectionQueue.shift();
      nextTick(cb.bind(null, null, connection));
    } else {
      this._freeConnections.push(connection);
      this.emit('release', connection);
    }
  }

  end(cb: any) {
    this._closed = true;
    if (typeof cb !== 'function') {
      cb = function(err: Error) {
        if (err) {
          throw err;
        }
      };
    }
    let calledBack = false;
    let closedConnections = 0;
    let connection: PoolConnection;
    const endCB = (err?: Error) => {
      if (calledBack) {
        return;
      }
      if (err || ++closedConnections >= this._allConnections.length) {
        calledBack = true;
        cb(err);
        return;
      }
    };
    if (this._allConnections.length === 0) {
      endCB();
      return;
    }
    for (let i = 0; i < this._allConnections.length; i++) {
      connection = this._allConnections.get(i);
      connection._realEnd(endCB);
    }
  }

  query(sql?: any, values?: any, cb?: any) {
    const cmdQuery = Connection.createQuery(
      sql,
      values,
      cb,
      this.config.connectionConfig
    );
    if (typeof cmdQuery.namedPlaceholders === 'undefined') {
      cmdQuery.namedPlaceholders = this.config.connectionConfig.namedPlaceholders;
    }
    this.getConnection((err: Error, conn: PoolConnection) => {
      if (err) {
        if (typeof cmdQuery.onResult === 'function') {
          cmdQuery.onResult(err);
        } else {
          cmdQuery.emit('error', err);
        }
        return;
      }
      try {
        conn.query(cmdQuery).once('end', () => {
          conn.release();
        });
      } catch (e) {
        conn.release();
        throw e;
      }
    });
    return cmdQuery;
  }

  execute(sql?: any, values?: any, cb?: any) {
    // TODO construct execute command first here and pass it to connection.execute
    // so that polymorphic arguments logic is there in one place
    if (typeof values === 'function') {
      cb = values;
      values = [];
    }
    this.getConnection((err?: Error, conn?: any) => {
      if (err) {
        return cb(err);
      }
      try {
        conn.execute(sql, values, cb).once('end', () => {
          conn.release();
        });
      } catch (e) {
        conn.release();
        throw e;
      }
    });
  }

  _removeConnection(connection: any) {
    // Remove connection from all connections
    spliceConnection(this._allConnections, connection);
    // Remove connection from free connections
    spliceConnection(this._freeConnections, connection);
    this.releaseConnection(connection);
  }

  format(sql: any, values: any) {
    return format(
      sql,
      values,
      this.config.connectionConfig.stringifyObjects,
      this.config.connectionConfig.timezone
    );
  }

  escape(value: any) {
    return escape(
      value,
      this.config.connectionConfig.stringifyObjects,
      this.config.connectionConfig.timezone
    );
  }

  escapeId(value: any) {
    return escapeId(value, false);
  }
}

export { Pool }
