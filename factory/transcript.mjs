#!/usr/bin/env node
// Claude Code session transcripts (~/.claude/projects/<slug>/<session-id>.jsonl): one JSON entry
// per line. Audit agents, the context meter and `npm run decide` read them through this module
// instead of each writing its own parser.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { cli, UsageError } from './cli.mjs';

// Claude Code keeps a project's transcripts in ~/.claude/projects/<slug>, where the slug is the
// checkout's path with every character other than a letter or digit turned into "-".
export function transcriptsDir(checkout, home = homedir()) {
  return join(home, '.claude', 'projects', checkout.replace(/[^A-Za-z0-9]/g, '-'));
}

// The transcripts folder of the main checkout that holds `root`. Sessions run in the main checkout,
// so from a git worktree this is the folder of the checkout holding the shared .git directory.
export function projectTranscripts(root, home = homedir()) {
  const common = spawnSync('git', ['-C', root, 'rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' });
  const main = common.status === 0 ? dirname(common.stdout.trim()) : root;
  return transcriptsDir(resolve(main), home);
}

// Every entry of a transcript, in file order. A line that is not JSON (the last line while
// Claude Code is still writing it) is skipped.
export function readTranscript(file) {
  const entries = [];
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    try {
      entries.push(JSON.parse(line));
    } catch {
      // half-written or blank line
    }
  }
  return entries;
}

// A main-thread model reply: not an API error or other placeholder Claude Code writes in its
// place, and not a subagent's (sidechain) reply.
const isReply = (e) =>
  e?.type === 'assistant' && e.message?.usage && !e.isApiErrorMessage && e.message.model !== '<synthetic>' && !e.isSidechain;

// The token usage of the session's latest main-thread assistant message ({ input_tokens,
// cache_creation_input_tokens, cache_read_input_tokens, output_tokens }), or null if none.
export function latestUsage(file) {
  return readTranscript(file).findLast(isReply)?.message.usage ?? null;
}

// The session's context size in tokens: everything the latest main-thread reply read as input
// (uncached, cache read and cache creation). Null when no reply carries usage.
export function contextTokens(file) {
  const u = latestUsage(file);
  if (!u) return null;
  return (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
}

const oneLine = (s) => String(s).replace(/\s+/g, ' ').trim();

// What a tool call did, in one line: a shell command as typed, any other input as JSON.
function toolInput(input = {}) {
  return oneLine(typeof input.command === 'string' ? input.command : JSON.stringify(input));
}

// The session as text, one "<timestamp> <who>: <text>" line per user message, assistant text block
// and tool call. Tool results are left out. Audit agents read this, and the timestamps are what a
// transcript:<session>@<time> pointer cites.
export function digest(file) {
  const lines = [];
  for (const e of readTranscript(file)) {
    if (e?.type !== 'user' && e?.type !== 'assistant') continue;
    const content = e.message?.content;
    const blocks = typeof content === 'string' ? [{ type: 'text', text: content }] : Array.isArray(content) ? content : [];
    for (const b of blocks) {
      if (b?.type === 'text' && oneLine(b.text)) lines.push(`${e.timestamp} ${e.type}: ${oneLine(b.text)}`);
      else if (b?.type === 'tool_use') lines.push(`${e.timestamp} tool ${b.name}: ${toolInput(b.input)}`);
    }
  }
  return lines;
}

cli(import.meta.url, {
  usage: 'node factory/transcript.mjs <session-id | transcript.jsonl> [--usage]',
  options: { usage: 'flag' },
  positionals: true,
}, ({ positionals: [target, ...extra], usage }) => {
  if (!target) throw new UsageError('missing session id or transcript file');
  if (extra.length) throw new UsageError(`unexpected argument: ${extra[0]}`);
  // A bare session id is looked up in this project's transcripts folder.
  const file = target.endsWith('.jsonl') ? target : join(projectTranscripts(process.cwd()), `${target}.jsonl`);
  if (!existsSync(file)) throw new UsageError(`no transcript at ${file}`);
  process.stdout.write(usage ? `${JSON.stringify(latestUsage(file))}\n` : digest(file).map((l) => `${l}\n`).join(''));
});
