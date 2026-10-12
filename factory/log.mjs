#!/usr/bin/env node
// Event writer. Validates one event, stamps ts/run/agent, and appends one JSON line to
// <root>/factory/agents/<run>/<agent>.jsonl, the calling agent's own activity file.
//
//   node factory/log.mjs --run <run-id> --agent <agent-id> [--root <repo>] <type> key=value ...
//
// Root:  --root, else FACTORY_ROOT, else CLAUDE_PROJECT_DIR, else the repo this script lives in.
//        Never the cwd: subagents run in worktrees, but activity files live in the main checkout.
// Run:   --run, else FACTORY_RUN, else the run marker's run.     Agent: --agent, else FACTORY_AGENT.
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cli, UsageError } from './cli.mjs';
import { defaultRun } from './run-marker.mjs';

// The API contract from issue #1. Dashboards depend on it.
const SCHEMA = {
  'agent.start': { required: ['role', 'parent'] },
  'agent.stop': { required: ['role', 'status'], enums: { status: ['PASS', 'ISSUES', 'BLOCKED'] } },
  artifact: { required: ['path', 'kind'] },
  'fetch.failed': { required: ['ref', 'url', 'reason'] },
  check: { required: ['name', 'result', 'evidence'], enums: { result: ['pass', 'fail'] } },
};

export const UNKNOWN = 'unknown';
const STAMPED = ['ts', 'run', 'agent', 'type'];
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

class EventError extends Error {}

export function defaultRoot(env = process.env) {
  return env.FACTORY_ROOT || env.CLAUDE_PROJECT_DIR || resolve(dirname(fileURLToPath(import.meta.url)), '..');
}

export function activityFile(root, run, agent) {
  return join(root, 'factory', 'agents', run, `${agent}.jsonl`);
}

// fillUnknown: a field the caller could not supply (a hook payload gap) is recorded as
// "unknown" instead of rejecting the event. Only hooks use it.
export function writeEvent({ root, run, agent, type, fields = {}, fillUnknown = false }) {
  if (!root) throw new EventError('missing root');
  checkId('run', run);
  checkId('agent', agent);
  if (!type) throw new EventError('missing field: type');
  const spec = SCHEMA[type];
  if (!spec) throw new EventError(`unknown event type: ${type} (known: ${Object.keys(SCHEMA).join(', ')})`);
  for (const k of STAMPED) {
    if (k in fields) throw new EventError(`field ${k} is stamped by the writer; do not pass it`);
  }

  const event = { ts: new Date().toISOString(), run, agent, type };
  for (const k of spec.required) {
    const v = fields[k];
    if (v === undefined || v === null || v === '') {
      if (!fillUnknown) throw new EventError(`${type}: missing required field: ${k}`);
      event[k] = UNKNOWN;
    } else {
      event[k] = String(v);
    }
  }
  for (const [k, allowed] of Object.entries(spec.enums || {})) {
    const ok = allowed.includes(event[k]) || (fillUnknown && event[k] === UNKNOWN);
    if (!ok) throw new EventError(`${type}: field ${k} must be one of ${allowed.join(', ')}; got ${event[k]}`);
  }
  for (const [k, v] of Object.entries(fields)) {
    if (!(k in event) && v !== undefined) event[k] = v;
  }

  const file = activityFile(root, run, agent);
  mkdirSync(dirname(file), { recursive: true });
  // One appendFileSync call = one write with O_APPEND, so concurrent writers never interleave a line.
  appendFileSync(file, JSON.stringify(event) + '\n');
  return event;
}

// Where each id can come from, for the error when it is missing.
const SOURCES = {
  run: 'pass --run, set FACTORY_RUN, or mark the run with factory/run-marker.mjs start',
  agent: 'pass --agent or set FACTORY_AGENT',
};

function checkId(name, v) {
  if (!v) throw new EventError(`missing field: ${name} (${SOURCES[name]})`);
  if (!ID.test(v)) throw new EventError(`invalid ${name}: ${v} (letters, digits, '.', '_', '-' only)`);
}

// A rejected event is the caller's mistake, like a bad argument: usage and exit 2.
cli(import.meta.url, {
  usage: 'node factory/log.mjs --run <run-id> --agent <agent-id> [--root <repo>] <type> key=value ...',
  options: { root: 'string', run: 'string', agent: 'string' },
  positionals: true,
}, ({ positionals: [type, ...pairs], ...opts }) => {
  const env = process.env;
  const fields = {};
  for (const kv of pairs) {
    const eq = kv.indexOf('=');
    if (eq <= 0) throw new UsageError(`expected key=value, got: ${kv}`);
    fields[kv.slice(0, eq)] = kv.slice(eq + 1);
  }
  try {
    const root = opts.root ?? defaultRoot(env);
    const event = writeEvent({ root, run: defaultRun(root, env), agent: env.FACTORY_AGENT, ...opts, type, fields });
    process.stdout.write(JSON.stringify(event) + '\n');
  } catch (err) {
    throw err instanceof EventError ? new UsageError(err.message) : err;
  }
});
