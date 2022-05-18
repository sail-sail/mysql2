// deno-lint-ignore-file no-explicit-any
// This file was modified by Oracle on September 21, 2021.
// New connection options for additional authentication factors were
// introduced.
// Multi-factor authentication capability is now enabled if one of these
// options is used.
// Modifications copyright (c) 2021, Oracle and/or its affiliates.

import { URL } from "../deps.ts";
import * as ClientConstants from "./constants/client.ts";
import * as Charsets from "./constants/charsets.ts";
// let SSLProfiles = null;

const validOptions: any = {
  authPlugins: 1,
  authSwitchHandler: 1,
  bigNumberStrings: 1,
  charset: 1,
  charsetNumber: 1,
  compress: 1,
  connectAttributes: 1,
  connectTimeout: 1,
  database: 1,
  dateStrings: 1,
  debug: 1,
  decimalNumbers: 1,
  enableKeepAlive: 1,
  flags: 1,
  host: 1,
  insecureAuth: 1,
  isServer: 1,
  keepAliveInitialDelay: 1,
  localAddress: 1,
  maxPreparedStatements: 1,
  multipleStatements: 1,
  namedPlaceholders: 1,
  nestTables: 1,
  password: 1,
  // with multi-factor authentication, the main password (used for the first
  // authentication factor) can be provided via password1
  password1: 1,
  password2: 1,
  password3: 1,
  passwordSha1: 1,
  pool: 1,
  port: 1,
  queryFormat: 1,
  rowsAsArray: 1,
  socketPath: 1,
  ssl: 1,
  stream: 1,
  stringifyObjects: 1,
  supportBigNumbers: 1,
  timezone: 1,
  trace: 1,
  typeCast: 1,
  uri: 1,
  user: 1,
  // These options are used for Pool
  connectionLimit: 1,
  Promise: 1,
  queueLimit: 1,
  waitForConnections: 1
};

class ConnectionConfig {
  isServer: boolean;
  
  stream: any;
  host: string;
  port: number;
  localAddress: string;
  socketPath: string;
  user: string;
  password: string;
  password2: string|undefined;
  password3: string|undefined;
  passwordSha1: string;
  database: string;
  connectTimeout: number;
  
  insecureAuth: any;
  supportBigNumbers: boolean;
  bigNumberStrings: boolean;
  decimalNumbers: boolean;
  dateStrings: boolean;
  debug: boolean;
  trace: boolean;
  stringifyObjects: boolean;
  enableKeepAlive: boolean;
  
  keepAliveInitialDelay: number;
  timezone: string;
  queryFormat: any;
  pool: any;
  multipleStatements: any;
  rowsAsArray: any;
  namedPlaceholders: any;
  nestTables: any;
  typeCast: any;
  maxPacketSize: number;
  charsetNumber: any;
  compress: any;
  authPlugins: any;
  authSwitchHandler: any;
  clientFlags: number;
  connectAttributes: any;
  maxPreparedStatements: any;
  
  
  constructor(options: any) {
    if (typeof options === 'string') {
      options = ConnectionConfig.parseUrl(options);
    } else if (options && options.uri) {
      const uriOptions = ConnectionConfig.parseUrl(options.uri);
      for (const key in uriOptions) {
        if (!Object.prototype.hasOwnProperty.call(uriOptions, key)) continue;
        if (options[key]) continue;
        options[key] = uriOptions[key];
      }
    }
    for (const key in options) {
      if (!Object.prototype.hasOwnProperty.call(options, key)) continue;
      if (validOptions[key] !== 1) {
        // REVIEW: Should this be emitted somehow?
        // eslint-disable-next-line no-console
        console.error(
          `Ignoring invalid configuration option passed to Connection: ${key}. This is currently a warning, but in future versions of MySQL2, an error will be thrown if you pass an invalid configuration option to a Connection`
        );
      }
    }
    this.isServer = options.isServer;
    this.stream = options.stream;
    this.host = options.host || 'localhost';
    this.port = options.port || 3306;
    this.localAddress = options.localAddress;
    this.socketPath = options.socketPath;
    this.user = options.user || undefined;
    // for the purpose of multi-factor authentication, or not, the main
    // password (used for the 1st authentication factor) can also be
    // provided via the "password1" option
    this.password = options.password || options.password1 || undefined;
    this.password2 = options.password2 || undefined;
    this.password3 = options.password3 || undefined;
    this.passwordSha1 = options.passwordSha1 || undefined;
    this.database = options.database;
    this.connectTimeout = isNaN(options.connectTimeout)
      ? 10 * 1000
      : options.connectTimeout;
    this.insecureAuth = options.insecureAuth || false;
    this.supportBigNumbers = options.supportBigNumbers || false;
    this.bigNumberStrings = options.bigNumberStrings || false;
    this.decimalNumbers = options.decimalNumbers || false;
    this.dateStrings = options.dateStrings || false;
    this.debug = options.debug;
    this.trace = options.trace !== false;
    this.stringifyObjects = options.stringifyObjects || false;
    this.enableKeepAlive = !!options.enableKeepAlive;
    this.keepAliveInitialDelay = options.keepAliveInitialDelay || 0;
    if (
      options.timezone &&
      !/^(?:local|Z|[ +-]\d\d:\d\d)$/.test(options.timezone)
    ) {
      // strictly supports timezones specified by mysqljs/mysql:
      // https://github.com/mysqljs/mysql#user-content-connection-options
      // eslint-disable-next-line no-console
      console.error(
        `Ignoring invalid timezone passed to Connection: ${options.timezone}. This is currently a warning, but in future versions of MySQL2, an error will be thrown if you pass an invalid configuration option to a Connection`
      );
      // SqlStrings falls back to UTC on invalid timezone
      this.timezone = 'Z';
    } else {
      this.timezone = options.timezone || 'local';
    }
    this.queryFormat = options.queryFormat;
    this.pool = options.pool || undefined;
    // this.ssl =
    //   typeof options.ssl === 'string'
    //     ? ConnectionConfig.getSSLProfile(options.ssl)
    //     : options.ssl || false;
    this.multipleStatements = options.multipleStatements || false;
    this.rowsAsArray = options.rowsAsArray || false;
    this.namedPlaceholders = options.namedPlaceholders || false;
    this.nestTables =
      options.nestTables === undefined ? undefined : options.nestTables;
    this.typeCast = options.typeCast === undefined ? true : options.typeCast;
    if (this.timezone[0] === ' ') {
      // "+" is a url encoded char for space so it
      // gets translated to space when giving a
      // connection string..
      this.timezone = `+${this.timezone.slice(1)}`;
    }
    // if (this.ssl) {
    //   if (typeof this.ssl !== 'object') {
    //     throw new TypeError(
    //       `SSL profile must be an object, instead it's a ${typeof this.ssl}`
    //     );
    //   }
    //   // Default rejectUnauthorized to true
    //   this.ssl.rejectUnauthorized = this.ssl.rejectUnauthorized !== false;
    // }
    this.maxPacketSize = 0;
    this.charsetNumber = options.charset
      ? ConnectionConfig.getCharsetNumber(options.charset)
      : options.charsetNumber || Charsets.UTF8MB4_UNICODE_CI;
    this.compress = options.compress || false;
    this.authPlugins = options.authPlugins;
    this.authSwitchHandler = options.authSwitchHandler;
    this.clientFlags = ConnectionConfig.mergeFlags(
      ConnectionConfig.getDefaultFlags(options),
      options.flags || ''
    );
    this.connectAttributes = options.connectAttributes;
    this.maxPreparedStatements = options.maxPreparedStatements || 16000;
  }

  
  static mergeFlags(default_flags:any, user_flags: any) {
    let flags = 0x0,
      i;
    if (!Array.isArray(user_flags)) {
      user_flags = String(user_flags || '')
        .toUpperCase()
        .split(/\s*,+\s*/);
    }
    // add default flags unless "blacklisted"
    for (i in default_flags) {
      if (user_flags.indexOf(`-${default_flags[i]}`) >= 0) {
        continue;
      }
      
      flags |= (ClientConstants as any)[default_flags[i]] || 0x0;
    }
    // add user flags unless already already added
    for (i in user_flags) {
      if (user_flags[i][0] === '-') {
        continue;
      }
      if (default_flags.indexOf(user_flags[i]) >= 0) {
        continue;
      }
      
      flags |= (ClientConstants as any)[user_flags[i]] || 0x0;
    }
    return flags;
  }

  
  static getDefaultFlags(options: any) {
    const defaultFlags = [
      'LONG_PASSWORD',
      'FOUND_ROWS',
      'LONG_FLAG',
      'CONNECT_WITH_DB',
      'ODBC',
      'LOCAL_FILES',
      'IGNORE_SPACE',
      'PROTOCOL_41',
      'IGNORE_SIGPIPE',
      'TRANSACTIONS',
      'RESERVED',
      'SECURE_CONNECTION',
      'MULTI_RESULTS',
      'TRANSACTIONS',
      'SESSION_TRACK'
    ];
    if (options && options.multipleStatements) {
      defaultFlags.push('MULTI_STATEMENTS');
    }
    defaultFlags.push('PLUGIN_AUTH');
    defaultFlags.push('PLUGIN_AUTH_LENENC_CLIENT_DATA');
    if (options && options.connectAttributes) {
      defaultFlags.push('CONNECT_ATTRS');
    }
    return defaultFlags;
  }

  static getCharsetNumber(charset: string) {
    
    const num = (Charsets as any)[charset.toUpperCase()];
    if (num === undefined) {
      throw new TypeError(`Unknown charset '${charset}'`);
    }
    return num;
  }

  // static getSSLProfile(name) {
  //   if (!SSLProfiles) {
  //     SSLProfiles = require('./constants/ssl_profiles.js');
  //   }
  //   const ssl = SSLProfiles[name];
  //   if (ssl === undefined) {
  //     throw new TypeError(`Unknown SSL profile '${name}'`);
  //   }
  //   return ssl;
  // }
  static parseUrl(url: string) {
    const parsedUrl = new URL(url);
    
    const options: any = {
      host: parsedUrl.hostname,
      port: parsedUrl.port,
      database: parsedUrl.pathname.slice(1),
      user: parsedUrl.username,
      password: parsedUrl.password
    };
    parsedUrl.searchParams.forEach((value, key) => {
      try {
        // Try to parse this as a JSON expression first
        options[key] = JSON.parse(value);
      } catch (_err) {
        // Otherwise assume it is a plain string
        options[key] = value;
      }
    });
    return options;
  }
}

export { ConnectionConfig };
