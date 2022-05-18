import {
  iconv_lite as Iconv,
  Buffer,
} from "../../deps.ts";

export function decode(buffer: Buffer, encoding?: string, start?: number, end?: number, options?: {
  stripBOM?: boolean | (() => void);
}): string {
  if (!encoding || Buffer.isEncoding(encoding)) {
    return buffer.toString(encoding, start, end);
  }

  const decoder = Iconv.getDecoder(encoding, options || {});

  const res = decoder.write(buffer.slice(start, end));
  const trail = decoder.end();

  return trail ? res + trail : res;
}

export function encode(string: string, encoding = "utf8", options?: {
  addBOM?: boolean | undefined;
}): Buffer {
  if (Buffer.isEncoding(encoding)) {
    return Buffer.from(string, encoding);
  }

  const encoder = Iconv.getEncoder(encoding, options || {});

  const res = encoder.write(string);
  const trail = encoder.end();

  return trail && trail.length > 0 ? Buffer.concat([res, trail]) : res;
}
