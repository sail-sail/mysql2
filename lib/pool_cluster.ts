// @deno-types="../typing/mysql/lib/PoolCluster.d.ts"
// deno-lint-ignore-file no-explicit-any
import {
  nextTick,
  EventEmitter,
} from "../deps.ts";
import { Pool } from "./pool.ts";
import { PoolConfig } from "./pool_config.ts";
import { Connection } from "./connection.ts";

/**
 * Selector
 */
const makeSelector: any = {
  RR() {
    let index = 0;
    return (clusterIds: number[]) => clusterIds[index++ % clusterIds.length];
  },
  RANDOM() {
    return (clusterIds: number[]) =>
      clusterIds[Math.floor(Math.random() * clusterIds.length)];
  },
  ORDER() {
    return (clusterIds: number[]) => clusterIds[0];
  }
};

class PoolNamespace {
  
  private _cluster: any;
  private _pattern: any;
  private _selector: any;
  
  constructor(cluster: any, pattern: any, selector: any) {
    this._cluster = cluster;
    this._pattern = pattern;
    this._selector = makeSelector[selector]();
  }

  getConnection(cb: any) {
    const clusterNode = this._getClusterNode();
    if (clusterNode === null) {
      return cb(new Error('Pool does Not exists.'));
    }
    return this._cluster._getConnection(clusterNode, (err: any, connection: any) => {
      if (err) {
        return cb(err);
      }
      if (connection === 'retry') {
        return this.getConnection(cb);
      }
      return cb(null, connection);
    });
  }

  /**
   * pool cluster query
   * @param {*} sql
   * @param {*} values
   * @param {*} cb
   * @returns query
   */
  query(sql?: any, values?: any, cb?: any) {
    const query = Connection.createQuery(sql, values, cb, {});
    this.getConnection((err: any, conn: any) => {
      if (err) {
        if (typeof query.onResult === 'function') {
          query.onResult(err);
        } else {
          query.emit('error', err);
        }
        return;
      }
      try {
        conn.query(query).once('end', () => {
          conn.release();
        });
      } catch (e) {
        conn.release();
        throw e;
      }
    });
    return query;
  }

  /**
   * pool cluster execute
   * @param {*} sql 
   * @param {*} values 
   * @param {*} cb 
   */
  execute(sql: any, values: any, cb: any) {
    if (typeof values === 'function') {
      cb = values;
      values = [];
    }
    this.getConnection((err: any, conn: any) => {
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

  _getClusterNode() {
    const foundNodeIds = this._cluster._findNodeIds(this._pattern);
    if (foundNodeIds.length === 0) {
      return null;
    }
    const nodeId =
      foundNodeIds.length === 1
        ? foundNodeIds[0]
        : this._selector(foundNodeIds);
    return this._cluster._getNode(nodeId);
  }
}

class PoolCluster extends EventEmitter {
  
  private _canRetry: any;
  private _removeNodeErrorCount: any;
  private _defaultSelector: any;
  private _closed: boolean;
  private _lastId: number;
  private _nodes: any;
  private _serviceableNodeIds: any[];
  private _namespaces: any;
  private _findCaches: any;
  
  constructor(config: any) {
    super();
    config = config || {};
    this._canRetry =
      typeof config.canRetry === 'undefined' ? true : config.canRetry;
    this._removeNodeErrorCount = config.removeNodeErrorCount || 5;
    this._defaultSelector = config.defaultSelector || 'RR';
    this._closed = false;
    this._lastId = 0;
    this._nodes = {};
    this._serviceableNodeIds = [];
    this._namespaces = {};
    this._findCaches = {};
  }

  of(pattern?: any, selector?: any) {
    pattern = pattern || '*';
    selector = selector || this._defaultSelector;
    selector = selector.toUpperCase();
    if (!makeSelector[selector] === undefined) {
      selector = this._defaultSelector;
    }
    const key = pattern + selector;
    if (typeof this._namespaces[key] === 'undefined') {
      this._namespaces[key] = new PoolNamespace(this, pattern, selector);
    }
    return this._namespaces[key];
  }

  add(id: any, config: any) {
    if (typeof id === 'object') {
      config = id;
      id = `CLUSTER::${++this._lastId}`;
    }
    if (typeof this._nodes[id] === 'undefined') {
      this._nodes[id] = {
        id: id,
        errorCount: 0,
        pool: new Pool({ config: new PoolConfig(config) })
      };
      this._serviceableNodeIds.push(id);
      this._clearFindCaches();
    }
  }

  getConnection(pattern: any, selector: any, cb: any) {
    let namespace;
    if (typeof pattern === 'function') {
      cb = pattern;
      namespace = this.of();
    } else {
      if (typeof selector === 'function') {
        cb = selector;
        selector = this._defaultSelector;
      }
      namespace = this.of(pattern, selector);
    }
    namespace.getConnection(cb);
  }

  end(callback: any) {
    const cb =
      callback !== undefined
        ? callback
        : (err: Error) => {
          if (err) {
            throw err;
          }
        };
    if (this._closed) {
      nextTick(cb);
      return;
    }
    this._closed = true;

    let calledBack = false;
    let waitingClose = 0;
    const onEnd = (err?: Error) => {
      if (!calledBack && (err || --waitingClose <= 0)) {
        calledBack = true;
        return cb(err);
      }
    };

    for (const id in this._nodes) {
      waitingClose++;
      this._nodes[id].pool.end(onEnd);
    }
    if (waitingClose === 0) {
      nextTick(onEnd);
    }
  }

  _findNodeIds(pattern: any) {
    if (typeof this._findCaches[pattern] !== 'undefined') {
      return this._findCaches[pattern];
    }
    let foundNodeIds;
    if (pattern === '*') {
      // all
      foundNodeIds = this._serviceableNodeIds;
    } else if (this._serviceableNodeIds.indexOf(pattern) !== -1) {
      // one
      foundNodeIds = [pattern];
    } else {
      // wild matching
      const keyword = pattern.substring(pattern.length - 1, 0);
      foundNodeIds = this._serviceableNodeIds.filter(id =>
        id.startsWith(keyword)
      );
    }
    this._findCaches[pattern] = foundNodeIds;
    return foundNodeIds;
  }

  _getNode(id: any) {
    return this._nodes[id] || null;
  }

  _increaseErrorCount(node: any) {
    if (++node.errorCount >= this._removeNodeErrorCount) {
      const index = this._serviceableNodeIds.indexOf(node.id);
      if (index !== -1) {
        this._serviceableNodeIds.splice(index, 1);
        delete this._nodes[node.id];
        this._clearFindCaches();
        node.pool.end();
        this.emit('remove', node.id);
      }
    }
  }

  _decreaseErrorCount(node: any) {
    if (node.errorCount > 0) {
      --node.errorCount;
    }
  }

  _getConnection(node: any, cb: any) {
    node.pool.getConnection((err: Error, connection: any) => {
      if (err) {
        this._increaseErrorCount(node);
        if (this._canRetry) {
          // REVIEW: this seems wrong?
          this.emit('warn', err);
          // eslint-disable-next-line no-console
          console.warn(`[Error] PoolCluster : ${err}`);
          return cb(null, 'retry');
        }
        return cb(err);
      }
      this._decreaseErrorCount(node);

      connection._clusterId = node.id;
      return cb(null, connection);
    });
  }

  _clearFindCaches() {
    this._findCaches = {};
  }
}

export { PoolCluster }
