// @deno-types="./promise.d.ts"
// deno-lint-ignore-file no-explicit-any
import * as core from "./index.ts";
import { EventEmitter } from "./deps.ts";

function makeDoneCb(resolve: typeof Promise.resolve, reject: typeof Promise.reject, localErr: Error) {
  return function (err: Error, rows: any[], fields: any[]) {
    if (err) {
      localErr.message = err.message;
      (localErr as any).code = (err as any).code;
      (localErr as any).errno = (err as any).errno;
      (localErr as any).sql = (err as any).sql;
      (localErr as any).sqlState = (err as any).sqlState;
      (localErr as any).sqlMessage = (err as any).sqlMessage;
      reject(localErr);
    } else {
      resolve([rows, fields]);
    }
  };
}

function inheritEvents(source: EventEmitter, target: EventEmitter, events: string[]) {
  const listeners: any = {};
  target
    .on('newListener', eventName => {
      if (events.indexOf(eventName) >= 0 && !target.listenerCount(eventName)) {
        source.on(
          eventName,
          (listeners[eventName] = function (...args: any[]) {
            // const args: any[] = [].slice.call(arguments);
            args.unshift(eventName);

            (target.emit as any).apply(target, args);
          })
        );
      }
    })
    .on('removeListener', eventName => {
      if (events.indexOf(eventName) >= 0 && !target.listenerCount(eventName)) {
        source.removeListener(eventName, listeners[eventName]);
        delete listeners[eventName];
      }
    });
}

class PromisePreparedStatementInfo {
  
  statement: any;
  Promise: any;
  
  constructor(statement: any, promiseImpl: any) {
    this.statement = statement;
    this.Promise = promiseImpl;
  }

  execute(parameters: any) {
    const s = this.statement;
    const localErr = new Error();
    return new this.Promise((resolve: any, reject: any) => {
      const done = makeDoneCb(resolve, reject, localErr);
      if (parameters) {
        s.execute(parameters, done);
      } else {
        s.execute(done);
      }
    });
  }

  close() {
    return new this.Promise((resolve: any) => {
      this.statement.close();
      resolve();
    });
  }
}

class PromiseConnection extends EventEmitter {
  
  connection: any;
  Promise: any;
  
  constructor(connection: any, promiseImpl: any) {
    super();
    this.connection = connection;
    this.Promise = promiseImpl || Promise;
    inheritEvents(connection, this, [
      'error',
      'drain',
      'connect',
      'end',
      'enqueue'
    ]);
  }

  release() {
    this.connection.release();
  }

  query(query: any, params: any) {
    const c = this.connection;
    const localErr = new Error();
    if (typeof params === 'function') {
      throw new Error(
        'Callback function is not available with promise clients.'
      );
    }
    return new this.Promise((resolve: any, reject: any) => {
      const done = makeDoneCb(resolve, reject, localErr);
      if (params !== undefined) {
        c.query(query, params, done);
      } else {
        c.query(query, done);
      }
    });
  }

  execute(query: any, params: any) {
    const c = this.connection;
    const localErr = new Error();
    if (typeof params === 'function') {
      throw new Error(
        'Callback function is not available with promise clients.'
      );
    }
    return new this.Promise((resolve: any, reject: any) => {
      const done = makeDoneCb(resolve, reject, localErr);
      if (params !== undefined) {
        c.execute(query, params, done);
      } else {
        c.execute(query, done);
      }
    });
  }

  end() {
    return new this.Promise((resolve: any) => {
      this.connection.end(resolve);
    });
  }

  beginTransaction() {
    const c = this.connection;
    const localErr = new Error();
    return new this.Promise((resolve: any, reject: any) => {
      const done = makeDoneCb(resolve, reject, localErr);
      c.beginTransaction(done);
    });
  }

  commit() {
    const c = this.connection;
    const localErr = new Error();
    return new this.Promise((resolve: any, reject: any) => {
      const done = makeDoneCb(resolve, reject, localErr);
      c.commit(done);
    });
  }

  rollback() {
    const c = this.connection;
    const localErr = new Error();
    return new this.Promise((resolve: any, reject: any) => {
      const done = makeDoneCb(resolve, reject, localErr);
      c.rollback(done);
    });
  }

  ping() {
    const c = this.connection;
    const localErr = new Error();
    return new this.Promise((resolve: any, reject: any) => {
      const done = makeDoneCb(resolve, reject, localErr);
      c.ping(done);
    });
  }

  connect() {
    const c = this.connection;
    const localErr = new Error();
    return new this.Promise((resolve: any, reject: any) => {
      c.connect((err: any, param: any) => {
        if (err) {
          (localErr as any).message = err.message;
          (localErr as any).code = err.code;
          (localErr as any).errno = err.errno;
          (localErr as any).sqlState = err.sqlState;
          (localErr as any).sqlMessage = err.sqlMessage;
          reject(localErr);
        } else {
          resolve(param);
        }
      });
    });
  }

  prepare(options: any) {
    const c = this.connection;
    const promiseImpl = this.Promise;
    const localErr = new Error();
    return new this.Promise((resolve: any, reject: any) => {
      c.prepare(options, (err: any, statement: any) => {
        if (err) {
          localErr.message = err.message;
          (localErr as any).code = err.code;
          (localErr as any).errno = err.errno;
          (localErr as any).sqlState = err.sqlState;
          (localErr as any).sqlMessage = err.sqlMessage;
          reject(localErr);
        } else {
          const wrappedStatement = new PromisePreparedStatementInfo(
            statement,
            promiseImpl
          );
          resolve(wrappedStatement);
        }
      });
    });
  }

  // changeUser(options: any) {
  //   const c = this.connection;
  //   const localErr = new Error();
  //   return new this.Promise((resolve: any, reject: any) => {
  //     c.changeUser(options, err => {
  //       if (err) {
  //         localErr.message = err.message;
  //         localErr.code = err.code;
  //         localErr.errno = err.errno;
  //         localErr.sqlState = err.sqlState;
  //         localErr.sqlMessage = err.sqlMessage;
  //         reject(localErr);
  //       } else {
  //         resolve();
  //       }
  //     });
  //   });
  // }

  get config() {
    return this.connection.config;
  }

  get threadId() {
    return this.connection.threadId;
  }
  
  close() {
    return this.connection.close();
  }
  
  createBinlogStream() {
    return this.connection.createBinlogStream();
  }
  
  destroy() {
    return this.connection.destroy();
  }
  
  escape() {
    return this.connection.escape();
  }
  
  escapeId() {
    return this.connection.escapeId();
  }
  
  format() {
    return this.connection.format();
  }
  
  pause() {
    return this.connection.pause();
  }
  
  pipe() {
    return this.connection.pipe();
  }
  
  resume() {
    return this.connection.resume();
  }
  
  unprepare() {
    return this.connection.unprepare();
  }
  
}

function createConnection(opts: any) {
  const coreConnection = core.createConnection(opts);
  const createConnectionErr = new Error();
  const thePromise = opts.Promise || Promise;
  if (!thePromise) {
    throw new Error(
      'no Promise implementation available.' +
      'Use promise-enabled node version or pass userland Promise' +
      " implementation as parameter, for example: { Promise: require('bluebird') }"
    );
  }
  return new thePromise((resolve: any, reject: any) => {
    coreConnection.once('connect', () => {
      resolve(new PromiseConnection(coreConnection, thePromise));
    });
    coreConnection.once('error', err => {
      createConnectionErr.message = err.message;
      (createConnectionErr as any).code = err.code;
      (createConnectionErr as any).errno = err.errno;
      (createConnectionErr as any).sqlState = err.sqlState;
      reject(createConnectionErr);
    });
  });
}

class PromisePoolConnection extends PromiseConnection {
  constructor(connection: any, promiseImpl: any) {
    super(connection, promiseImpl);
  }

  destroy(...args: any[]) {
    return core.PoolConnection.prototype.destroy.apply(
      this.connection,
      args as any,
    );
  }
}

class PromisePool extends EventEmitter {
  
  pool: any;
  Promise: any;
  
  constructor(pool: any, thePromise: any) {
    super();
    this.pool = pool;
    this.Promise = thePromise || Promise;
    inheritEvents(pool, this, ['acquire', 'connection', 'enqueue', 'release']);
  }

  getConnection() {
    const corePool = this.pool;
    return new this.Promise((resolve: any, reject: any) => {
      corePool.getConnection((err: any, coreConnection: any) => {
        if (err) {
          reject(err);
        } else {
          resolve(new PromisePoolConnection(coreConnection, this.Promise));
        }
      });
    });
  }

  query(sql?: any, args?: any) {
    const corePool = this.pool;
    const localErr = new Error();
    if (typeof args === 'function') {
      throw new Error(
        'Callback function is not available with promise clients.'
      );
    }
    return new this.Promise((resolve: any, reject: any) => {
      const done = makeDoneCb(resolve, reject, localErr);
      if (args !== undefined) {
        corePool.query(sql, args, done);
      } else {
        corePool.query(sql, done);
      }
    });
  }

  execute(sql?: any, args?: any) {
    const corePool = this.pool;
    const localErr = new Error();
    if (typeof args === 'function') {
      throw new Error(
        'Callback function is not available with promise clients.'
      );
    }
    return new this.Promise((resolve: any, reject: any) => {
      const done = makeDoneCb(resolve, reject, localErr);
      if (args) {
        corePool.execute(sql, args, done);
      } else {
        corePool.execute(sql, done);
      }
    });
  }

  end() {
    const corePool = this.pool;
    const localErr = new Error();
    return new this.Promise((resolve: any, reject: any) => {
      corePool.end((err: any) => {
        if (err) {
          localErr.message = err.message;
          (localErr as any).code = err.code;
          (localErr as any).errno = err.errno;
          (localErr as any).sqlState = err.sqlState;
          (localErr as any).sqlMessage = err.sqlMessage;
          reject(localErr);
        } else {
          resolve();
        }
      });
    });
  }
  
  escape(...args: any[]) {
    return this.pool.escape.apply(this.pool, args);
  }
  
  escapeId(...args: any[]) {
    return this.pool.escapeId.apply(this.pool, args);
  }
  
  format(...args: any[]) {
    return this.pool.format.apply(this.pool, args);
  }
  
}

function createPool(opts: any) {
  const corePool = core.createPool(opts);
  const thePromise = opts.Promise || Promise;
  if (!thePromise) {
    throw new Error(
      'no Promise implementation available.' +
      'Use promise-enabled node version or pass userland Promise' +
      " implementation as parameter, for example: { Promise: require('bluebird') }"
    );
  }

  return new PromisePool(corePool, thePromise);
}

class PromisePoolCluster extends EventEmitter {
  
  poolCluster: any;
  Promise: any;
  
  constructor(poolCluster: any, thePromise: any) {
    super();
    this.poolCluster = poolCluster;
    this.Promise = thePromise || Promise;
    inheritEvents(poolCluster, this, ['acquire', 'connection', 'enqueue', 'release']);
  }

  getConnection() {
    const corePoolCluster = this.poolCluster;
    return new this.Promise((resolve: any, reject: any) => {
      corePoolCluster.getConnection((err: any, coreConnection: any) => {
        if (err) {
          reject(err);
        } else {
          resolve(new PromisePoolConnection(coreConnection, this.Promise));
        }
      });
    });
  }

  query(sql: any, args: any) {
    const corePoolCluster = this.poolCluster;
    const localErr = new Error();
    if (typeof args === 'function') {
      throw new Error(
        'Callback function is not available with promise clients.'
      );
    }
    return new this.Promise((resolve: any, reject: any) => {
      const done = makeDoneCb(resolve, reject, localErr);
      corePoolCluster.query(sql, args, done);
    });
  }

  execute(sql: any, args: any) {
    const corePoolCluster = this.poolCluster;
    const localErr = new Error();
    if (typeof args === 'function') {
      throw new Error(
        'Callback function is not available with promise clients.'
      );
    }
    return new this.Promise((resolve: any, reject: any) => {
      const done = makeDoneCb(resolve, reject, localErr);
      corePoolCluster.execute(sql, args, done);
    });
  }

  of(pattern: any, selector: any) {
    return new PromisePoolCluster(
      this.poolCluster.of(pattern, selector),
      this.Promise
    );
  }

  end() {
    const corePoolCluster = this.poolCluster;
    const localErr = new Error();
    return new this.Promise((resolve: any, reject: any) => {
      corePoolCluster.end((err: any) => {
        if (err) {
          localErr.message = err.message;
          (localErr as any).code = err.code;
          (localErr as any).errno = err.errno;
          (localErr as any).sqlState = err.sqlState;
          (localErr as any).sqlMessage = err.sqlMessage;
          reject(localErr);
        } else {
          resolve();
        }
      });
    });
  }
  
  add(...args: any[]) {
    return this.poolCluster.add.apply(this.poolCluster, args);
  }
  
}

function createPoolCluster(opts: any) {
  const corePoolCluster = core.createPoolCluster(opts);
  const thePromise = (opts && opts.Promise) || Promise;
  if (!thePromise) {
    throw new Error(
      'no Promise implementation available.' +
      'Use promise-enabled node version or pass userland Promise' +
      " implementation as parameter, for example: { Promise: require('bluebird') }"
    );
  }
  return new PromisePoolCluster(corePoolCluster, thePromise);
}

export { createConnection };
export { createPool };
export { createPoolCluster };
export const escape = core.escape;
export const escapeId = core.escapeId;
export const format = core.format;
export const raw = core.raw;
export { PromisePool };
export { PromiseConnection };
export { PromisePoolConnection };
