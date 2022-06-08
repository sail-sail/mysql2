
export { Buffer } from "https://deno.land/std@0.142.0/node/buffer.ts";
export {
  Socket,
  connect,
  Stream,
} from "https://deno.land/std@0.142.0/node/net.ts";
export { EventEmitter } from "https://deno.land/std@0.142.0/node/events.ts";
export { Readable } from "https://deno.land/std@0.142.0/node/stream.ts";
export {
  createSecureContext,
  TLSSocket,
} from "https://deno.land/std@0.142.0/node/tls.ts";
import zlib from "https://deno.land/std@0.142.0/node/zlib.ts";
export { URL } from "https://deno.land/std@0.142.0/node/url.ts";
export {
  createHash,
  publicEncrypt,
  // createCredentials,
  randomBytes,
} from "https://deno.land/std@0.142.0/node/crypto.ts";
export type { ErrnoException } from "https://deno.land/std@0.142.0/node/internal/errors.ts";
export { nextTick } from "https://deno.land/std@0.142.0/node/_process/process.ts";
export { createServer } from "https://deno.land/std@0.142.0/node/net.ts";

// node
import * as iconv_lite from "https://deno.land/x/iconv_lite@v1.0.1/mod.ts";
import { genfun } from "https://deno.land/x/generate_function@v1.0.1/mod.ts";
import * as seq_queue from "https://deno.land/x/seq_queue@v1.0.1/mod.ts";
// node

// not-node
export { Denque } from "https://deno.land/x/sail_denque@v1.0.0/mod.ts";
import * as sqlstring from "https://deno.land/x/sail_sqlstring@v1.0.0/mod.ts";
export { LRUCache } from "https://deno.land/x/sail_lru_cache@v7.10.3/mod.ts";
import * as named_placeholders from "https://deno.land/x/named_placeholders@v1.0.0/mod.ts";
import Long from "https://deno.land/x/long@v1.0.0/mod.ts";
// not-node

export { Long, iconv_lite, sqlstring, named_placeholders, genfun, zlib, seq_queue };