import { LRUCache as LRU } from "../../deps.ts";

const parserCache = new LRU({
  maxSize: 15000,
  sizeCalculation: function() {
    return 1;
  },
});

// deno-lint-ignore no-explicit-any
function keyFromFields(type: string, fields: any[], options: any, config: any) {
  let res =
    `${type}` +
    `/${typeof options.nestTables}` +
    `/${options.nestTables}` +
    `/${options.rowsAsArray}` +
    `/${options.supportBigNumbers || config.supportBigNumbers}` +
    `/${options.bigNumberStrings || config.bigNumberStrings}` +
    `/${typeof options.typeCast}` +
    `/${options.timezone || config.timezone}` +
    `/${options.decimalNumbers}` +
    `/${options.dateStrings}`;
  for (let i = 0; i < fields.length; ++i) {
    const field = fields[i];
    res += `/${field.name}:${field.columnType}:${field.length}:${field.schema}:${field.table}:${field.flags}:${field.characterSet}`;
  }
  return res;
}

// deno-lint-ignore ban-types no-explicit-any
function getParser(type: string, fields: any[], options: any, config: any, compiler: Function): any {
  const key = keyFromFields(type, fields, options, config);
  let parser = parserCache.get(key);

  if (parser) {
    return parser;
  }

  parser = compiler(fields, options, config);
  parserCache.set(key, parser);
  return parser;
}

function setMaxCache(maxSize: number) {
  // deno-lint-ignore no-explicit-any
  (parserCache as any).maxSize = maxSize;
}

function clearCache() {
  // parserCache.reset();
  parserCache.clear();
}

export {
  getParser,
  setMaxCache,
  clearCache,
}
