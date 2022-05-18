import { Connection } from "./connection.ts";
import { Pool } from "./pool.ts";
import { PromisePoolConnection } from "../promise.ts";

class PoolConnection extends Connection {
  // deno-lint-ignore no-explicit-any
  constructor(pool: Pool, options: any) {
    super(options);
    this._pool = pool;
    // When a fatal error occurs the connection's protocol ends, which will cause
    // the connection to end as well, thus we only need to watch for the end event
    // and we will be notified of disconnects.
    // REVIEW: Moved to `once`
    this.once('end', () => {
      this._removeFromPool();
    });
    this.once('error', () => {
      this._removeFromPool();
    });
  }

  release() {
    if (!this._pool || this._pool._closed) {
      return;
    }
    this._pool.releaseConnection(this);
  }

  // deno-lint-ignore no-explicit-any
  promise(promiseImpl: any) {
    // const PromisePoolConnection = require('../promise').PromisePoolConnection;
    return new PromisePoolConnection(this, promiseImpl);
  }

  // deno-lint-ignore no-explicit-any
  end(_callback?: any) {
    const err = new Error(
      'Calling conn.end() to release a pooled connection is ' +
        'deprecated. In next version calling conn.end() will be ' +
        'restored to default conn.end() behavior. Use ' +
        'conn.release() instead.'
    );
    this.emit('warn', err);
    // eslint-disable-next-line no-console
    console.warn(err.message);
    this.release();
  }

  destroy() {
    this._removeFromPool();
    super.destroy();
  }

  _removeFromPool() {
    if (!this._pool || this._pool._closed) {
      return;
    }
    const pool = this._pool;
    this._pool = null;
    pool._removeConnection(this);
  }
  
  // deno-lint-ignore no-explicit-any
  _realEnd(callback?: any) {
    return super.end(callback);
  }
  
}

PoolConnection.statementKey = Connection.statementKey;
export { PoolConnection };
