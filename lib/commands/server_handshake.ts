import { Connection } from "../connection.ts";
import { Packet } from "../packets/packet.ts";
import { Command } from "./command.ts";

import CommandCode from "../constants/commands.ts";
import * as Errors from "../constants/errors.ts";
import { Handshake } from "../packets/handshake.ts";
import { HandshakeResponse } from "../packets/handshake_response.ts";

// const Packets = require('../packets/index.js');

class ServerHandshake extends Command {
  
  // deno-lint-ignore no-explicit-any
  args: any;
  // deno-lint-ignore no-explicit-any
  serverHello: any;
  
  // deno-lint-ignore no-explicit-any
  constructor(args: any) {
    super();
    this.args = args;
    /*
    this.protocolVersion = args.protocolVersion || 10;
    this.serverVersion   = args.serverVersion;
    this.connectionId    = args.connectionId,
    this.statusFlags     = args.statusFlags,
    this.characterSet    = args.characterSet,
    this.capabilityFlags = args.capabilityFlags || 512;
    */
  }

  start(_packet: Packet, connection: Connection) {
    const serverHelloPacket = new Handshake(this.args);
    this.serverHello = serverHelloPacket;
    serverHelloPacket.setScrambleData((err?: Error) => {
      if (err) {
        connection.emit('error', new Error('Error generating random bytes'));
        return;
      }
      connection.writePacket(serverHelloPacket.toPacket(0));
    });
    return ServerHandshake.prototype.readClientReply;
  }

  readClientReply(packet: Packet, connection: Connection) {
    // check auth here
    const clientHelloReply = HandshakeResponse.fromPacket(packet);
    // TODO check we don't have something similar already
    connection.clientHelloReply = clientHelloReply;
    if (this.args.authCallback) {
      this.args.authCallback(
        {
          user: clientHelloReply.user,
          database: clientHelloReply.database,
          address: connection.stream.remoteAddress,
          authPluginData1: this.serverHello.authPluginData1,
          authPluginData2: this.serverHello.authPluginData2,
          authToken: clientHelloReply.authToken
        },
        (_err: Error, mysqlError: Error) => {
          // if (err)
          if (!mysqlError) {
            connection.writeOk();
          } else {
            // TODO create constants / errorToCode
            // 1045 = ER_ACCESS_DENIED_ERROR
            connection.writeError({
              message: mysqlError.message || '',
              // deno-lint-ignore no-explicit-any
              code: (mysqlError as any).code || 1045
            });
            connection.close();
          }
        }
      );
    } else {
      connection.writeOk();
    }
    return ServerHandshake.prototype.dispatchCommands;
  }

  dispatchCommands(packet: Packet, connection: Connection) {
    // command from client to server
    let knownCommand = true;
    const encoding = connection.clientHelloReply.encoding;
    const commandCode = packet.readInt8();
    switch (commandCode) {
      case CommandCode.QUIT:
        if (connection.listeners('quit').length) {
          connection.emit('quit');
        } else {
          connection.stream.end();
        }
        break;
      case CommandCode.INIT_DB:
        if (connection.listeners('init_db').length) {
          const schemaName = packet.readString(undefined, encoding);
          connection.emit('init_db', schemaName);
        } else {
          connection.writeOk();
        }
        break;
      case CommandCode.QUERY:
        if (connection.listeners('query').length) {
          const query = packet.readString(undefined, encoding);
          connection.emit('query', query);
        } else {
          connection.writeError({
            code: Errors.HA_ERR_INTERNAL_ERROR,
            message: 'No query handler'
          });
        }
        break;
      case CommandCode.FIELD_LIST:
        if (connection.listeners('field_list').length) {
          const table = packet.readNullTerminatedString();
          const fields = packet.readString(undefined, encoding);
          connection.emit('field_list', table, fields);
        } else {
          connection.writeError({
            code: Errors.ER_WARN_DEPRECATED_SYNTAX,
            message:
              'As of MySQL 5.7.11, COM_FIELD_LIST is deprecated and will be removed in a future version of MySQL.'
          });
        }
        break;
      case CommandCode.PING:
        if (connection.listeners('ping').length) {
          connection.emit('ping');
        } else {
          connection.writeOk();
        }
        break;
      default:
        knownCommand = false;
    }
    if (connection.listeners('packet').length) {
      connection.emit('packet', packet.clone(), knownCommand, commandCode);
    } else if (!knownCommand) {
      // eslint-disable-next-line no-console
      console.log('Unknown command:', commandCode);
    }
    return ServerHandshake.prototype.dispatchCommands;
  }
}

export { ServerHandshake };

// TODO: implement server-side 4.1 authentication
/*
4.1 authentication: (http://bazaar.launchpad.net/~mysql/mysql-server/5.5/view/head:/sql/password.c)

  SERVER:  public_seed=create_random_string()
           send(public_seed)

  CLIENT:  recv(public_seed)
           hash_stage1=sha1("password")
           hash_stage2=sha1(hash_stage1)
           reply=xor(hash_stage1, sha1(public_seed,hash_stage2)

           // this three steps are done in scramble()

           send(reply)


  SERVER:  recv(reply)
           hash_stage1=xor(reply, sha1(public_seed,hash_stage2))
           candidate_hash2=sha1(hash_stage1)
           check(candidate_hash2==hash_stage2)

server stores sha1(sha1(password)) ( hash_stag2)
*/
