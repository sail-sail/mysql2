/*

  this seems to be not only shorter, but faster than
  string.replace(/\\/g, '\\\\').
            replace(/\u0008/g, '\\b').
            replace(/\t/g, '\\t').
            replace(/\n/g, '\\n').
            replace(/\f/g, '\\f').
            replace(/\r/g, '\\r').
            replace(/'/g, '\\\'').
            replace(/"/g, '\\"');
  or string.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&")
  see http://jsperf.com/string-escape-regexp-vs-json-stringify
  */
function srcEscape(str: string) {
  return JSON.stringify({
    [str]: 1
  }).slice(1, -3);
}

export { srcEscape };

// let highlightFn;
// let cardinalRecommended = false;
// try {
//   highlightFn = require('cardinal').highlight;
// } catch (err) {
//   highlightFn = text => {
//     if (!cardinalRecommended) {
//       // eslint-disable-next-line no-console
//       console.log('For nicer debug output consider install cardinal@^2.0.0');
//       cardinalRecommended = true;
//     }
//     return text;
//   };
// }

/**
 * Prints debug message with code frame, will try to use `cardinal` if available.
 */
function printDebugWithCode(msg?: string, code?: string) {
  // eslint-disable-next-line no-console
  console.log(`\n\n${msg}:\n`);
  // eslint-disable-next-line no-console
  console.log(`${ code }\n`);
}

export { printDebugWithCode };

/**
 * checks whether the `type` is in the `list`
 */
// deno-lint-ignore no-explicit-any
function typeMatch(type: number, list: any, Types: any) {
  if (Array.isArray(list)) {
    return list.some(t => type === Types[t]);
  }

  return !!list;
}

export { typeMatch };
