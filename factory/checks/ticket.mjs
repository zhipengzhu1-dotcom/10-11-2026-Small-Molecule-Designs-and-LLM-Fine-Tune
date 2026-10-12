#!/usr/bin/env node
// Ticket check (issue #46). Flags a ticket body that asks for a deliverable name Claude Code
// refuses to let a subagent write, so no ticket sends a batch of agents at a refused name. Writes
// one check event and exits 0 on pass, 1 on fail.
//
//   node factory/checks/ticket.mjs [--root <repo>] [--run <id>] [--agent <id>] [--body <ticket.md>]
//
// The body is read from --body, else from stdin (`gh issue view 46 --json body -q .body | node
// factory/checks/ticket.mjs`). Run and agent default to FACTORY_RUN and FACTORY_AGENT, else run
// "manual" and agent "orchestrator".
//
// A refused name is a Markdown file whose name, split on anything but letters and digits, has a
// word in REFUSED: `summary.md`, `SUMMARY.md` and `final-report.md` fail; `notes.md`, `scout.md`
// and `review-a.md` pass. Each one is named with its line.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultRoot, writeEvent } from '../log.mjs';

// Report-like words Claude Code refuses in a subagent's .md writes. `summary` was refused for all
// 10 readers of #10 (run 14c93a90, see skills/orchestrator-lessons); the rest are the other
// report-like kinds Claude Code's subagent instructions name beside it.
export const REFUSED = ['summary', 'report', 'findings', 'analysis'];

function parseArgs(argv, env = process.env) {
  const opts = { root: defaultRoot(env), run: env.FACTORY_RUN || 'manual', agent: env.FACTORY_AGENT || 'orchestrator' };
  for (let i = 0; i < argv.length; i++) {
    const name = argv[i].replace(/^--/, '');
    if (!['root', 'run', 'agent', 'body'].includes(name) || i + 1 >= argv.length) {
      throw new Error(`unknown or incomplete argument: ${argv[i]}`);
    }
    opts[name] = argv[++i];
  }
  return opts;
}

// A Markdown file path as a ticket writes it: anything up to `.md` that isn't a space, quote,
// bracket or table pipe.
const MD_PATH = /[^\s`'"()[\]|,;]+\.md\b/gi;

// Each refused file name in a ticket body, as { line, path, word }.
export function refusedNames(text) {
  const found = [];
  text.split(/\r?\n/).forEach((line, i) => {
    for (const [path] of line.matchAll(MD_PATH)) {
      const words = path.split('/').pop().slice(0, -'.md'.length).toLowerCase().split(/[^a-z0-9]+/);
      const word = REFUSED.find((w) => words.includes(w));
      if (word) found.push({ line: i + 1, path, word });
    }
  });
  return found;
}

export function runCheck(opts) {
  const text = readFileSync(opts.body ?? 0, 'utf8');
  const found = refusedNames(text);
  const result = found.length ? 'fail' : 'pass';
  const where = opts.body ? opts.body.replace(/\\/g, '/') : 'stdin';
  const evidence = found.length
    ? `${where}: ${found.map((f) => `line ${f.line}: ${f.path} is refused to subagents ("${f.word}"); name it notes.md or <role>.md`).join('; ')}`
    : `${where}: no refused deliverable name`;
  writeEvent({ root: opts.root, run: opts.run, agent: opts.agent, type: 'check', fields: { name: 'ticket', result, evidence } });
  return { result, evidence };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const { result, evidence } = runCheck(parseArgs(process.argv.slice(2)));
    process.stdout.write(`ticket: ${result}: ${evidence}\n`);
    process.exit(result === 'pass' ? 0 : 1);
  } catch (err) {
    process.stderr.write(`ticket.mjs: ${err.message}\n`);
    process.exit(2);
  }
}
