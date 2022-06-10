
export { Buffer } from "https://deno.land/std/node/buffer.ts";
export {
  Socket,
  connect,
  Stream,
} from "https://deno.land/std/node/net.ts";
export { EventEmitter } from "https://deno.land/std/node/events.ts";
export { Readable } from "https://deno.land/std/node/stream.ts";
export {
  createSecureContext,
  TLSSocket,
} from "https://deno.land/std/node/tls.ts";
import zlib from "https://deno.land/std/node/zlib.ts";
export { URL } from "https://deno.land/std/node/url.ts";
export {
  createHash,
  publicEncrypt,
  // createCredentials,
  randomBytes,
} from "https://deno.land/std/node/crypto.ts";
export type { ErrnoException } from "https://deno.land/std/node/internal/errors.ts";
export { nextTick } from "https://deno.land/std/node/_process/process.ts";
export { createServer } from "https://deno.land/std/node/net.ts";

// node
import * as iconv_lite from "https://deno.land/x/iconv_lite/mod.ts";
import { genfun } from "https://deno.land/x/generate_function/mod.ts";
import * as seq_queue from "https://deno.land/x/seq_queue/mod.ts";
// node

// not-node
export { Denque } from "https://deno.land/x/sail_denque/mod.ts";
import * as sqlstring from "https://deno.land/x/sail_sqlstring/mod.ts";
export { LRUCache } from "https://deno.land/x/sail_lru_cache/mod.ts";
import * as named_placeholders from "https://deno.land/x/named_placeholders/mod.ts";
import Long from "https://deno.land/x/long/mod.ts";
// not-node

export { Long, iconv_lite, sqlstring, named_placeholders, genfun, zlib, seq_queue };