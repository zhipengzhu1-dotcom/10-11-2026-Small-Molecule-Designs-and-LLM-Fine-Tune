// The one argument parser and entry point for every factory CLI (issue #19).
//
//   cli(import.meta.url, { usage, options, positionals }, main)
//
// Runs main(opts) only when node was started with the calling file. `options` maps each option
// name to 'string', 'list' (repeatable) or 'flag', or to { type, short } for an option that also
// has a one-letter alias (`-m`); opts holds the parsed values, plus
// `positionals` when the CLI takes them. A CLI that takes none rejects them.
//
// main may be async. A number it returns is the exit code; otherwise the process ends on its own
// (a server keeps running). A UsageError, from the parser or from main, prints the message and the
// usage line and exits 2; any other error prints its message and exits `failure` (default 1).
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

export class UsageError extends Error {}

const TYPES = { string: { type: 'string' }, list: { type: 'string', multiple: true }, flag: { type: 'boolean' } };

function parse(argv, options, positionals) {
  const spec = Object.fromEntries(Object.entries(options).map(([name, o]) => {
    const { type, short } = typeof o === 'string' ? { type: o } : o;
    return [name, short ? { ...TYPES[type], short } : TYPES[type]];
  }));
  try {
    const parsed = parseArgs({ args: argv, options: spec, strict: true, allowPositionals: positionals });
    return positionals ? { ...parsed.values, positionals: parsed.positionals } : { ...parsed.values };
  } catch (err) {
    throw new UsageError(err.message);
  }
}

export function cli(url, { usage, options = {}, positionals = false, failure = 1 }, main) {
  const file = fileURLToPath(url);
  if (!process.argv[1] || resolve(process.argv[1]) !== file) return;
  const name = basename(file);
  Promise.resolve()
    .then(() => main(parse(process.argv.slice(2), options, positionals)))
    .then((code) => {
      if (typeof code === 'number') process.exitCode = code;
    })
    .catch((err) => {
      process.stderr.write(`${name}: ${err.message}\n`);
      if (err instanceof UsageError) process.stderr.write(`usage: ${usage}\n`);
      process.exitCode = err instanceof UsageError ? 2 : failure;
    });
}
