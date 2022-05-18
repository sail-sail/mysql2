//const PLUGIN_NAME = 'mysql_native_password';

import { Buffer } from "../../deps.ts";
import { calculateTokenFromPasswordSha, calculateToken } from "../auth_41.ts";
import { Connection } from "../connection.ts";

export default (pluginOptions: {
  password?: string,
  passwordSha1?: Buffer,
}) => ({ connection, command }: { connection: Connection, command: { password: string, passwordSha1: string } }) => {
  const password =
    command.password || pluginOptions.password || connection.config.password || "";
  const passwordSha1 =
    command.passwordSha1 ||
    pluginOptions.passwordSha1 ||
    connection.config.passwordSha1;
  return (data: Buffer) => {
    const authPluginData1 = data.slice(0, 8);
    const authPluginData2 = data.slice(8, 20);
    let authToken;
    if (passwordSha1) {
      authToken = calculateTokenFromPasswordSha(
        passwordSha1,
        authPluginData1,
        authPluginData2
      );
    } else {
      authToken = calculateToken(
        password,
        authPluginData1,
        authPluginData2
      );
    }
    return authToken;
  };
};
