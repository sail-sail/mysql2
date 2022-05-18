'use strict';


import { Buffer } from "../../deps.ts";
import { publicEncrypt } from "../../deps.ts";
import { xor } from "../auth_41.ts";
import { Connection } from "../connection.ts";

const PLUGIN_NAME = 'sha256_password';

const REQUEST_SERVER_KEY_PACKET = Buffer.from([1]);

const STATE_INITIAL = 0;
const STATE_WAIT_SERVER_KEY = 1;
const STATE_FINAL = -1;

function encrypt(password: string, scramble: Buffer, key: Buffer) {
  const stage1 = xor(
    Buffer.from(`${password}\0`, 'utf8').toString('binary'),
    scramble.toString('binary')
  );
  return publicEncrypt(key, stage1);
}

export default (pluginOptions: {
  serverPublicKey?: Buffer,
  onServerPublicKey?: (serverPublicKey: Buffer) => void,
} = {}) => ({ connection }: { connection: Connection }) => {
  let state = 0;
  let scramble: Buffer;

  const password = connection.config.password || "";

  const authWithKey = (serverKey: Buffer) => {
    const _password = encrypt(password, scramble, serverKey);
    state = STATE_FINAL;
    return _password;
  };

  return (data: Buffer) => {
    switch (state) {
      case STATE_INITIAL:
        scramble = data.slice(0, 20);
        // if client provides key we can save one extra roundrip on first connection
        if (pluginOptions.serverPublicKey) {
          return authWithKey(pluginOptions.serverPublicKey);
        }

        state = STATE_WAIT_SERVER_KEY;
        return REQUEST_SERVER_KEY_PACKET;

      case STATE_WAIT_SERVER_KEY:
        if (pluginOptions.onServerPublicKey) {
          pluginOptions.onServerPublicKey(data);
        }
        return authWithKey(data);
      case STATE_FINAL:
        throw new Error(
          `Unexpected data in AuthMoreData packet received by ${PLUGIN_NAME} plugin in STATE_FINAL state.`
        );
    }

    throw new Error(
      `Unexpected data in AuthMoreData packet received by ${PLUGIN_NAME} plugin in state ${state}`
    );
  };
};
