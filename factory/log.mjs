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
import { dirname, join } from 'node:path';
import { cli, UsageError } from './cli.mjs';
import { parseTarget } from './pointer.mjs';
import { readStream } from './read.mjs';
import { defaultRoot } from './root.mjs';
import { defaultRun } from './run-marker.mjs';

// Every CLI takes the root from here or from root.mjs; read.mjs takes it from root.mjs, so the
// writer and the reader do not import each other.
export { defaultRoot };

class EventError extends Error {}

// A ticket is a GitHub issue number, written `59` or `#59` and recorded as the number 59.
export function ticketNumber(v) {
  const m = /^#?([1-9]\d*)$/.exec(String(v));
  if (!m) throw new EventError(`ticket must be an issue number such as 59 or #59; got ${v}`);
  return Number(m[1]);
}

// A challenge id is a plain name, like a run or agent id, so `of=<id>` and a decision row's
// `closes challenge <id>` (decide.mjs) can name it exactly.
export function plainName(v) {
  return ID.test(v) ? null : `${v} is not a plain name (letters, digits, '.', '_', '-' only)`;
}

// A challenge target, or the pointer that eliminates one: see parseTarget in pointer.mjs.
function target(v) {
  const p = parseTarget(v);
  if (!p) return `${v} is not a pointer, row or event (row:<N>, event:<run>/<agent>:<line>, file:, commit:, transcript:, issue:, url:)`;
  return p.problem ?? null;
}

// Challenge ids are unique across the stream, and an elimination names one of them.
export const challenged = (events, id) => events.some((e) => e.type === 'challenge' && e.id === id);
const newId = (e, events) => (challenged(events, e.id) ? `id ${e.id} is already a challenge in the stream` : null);
const knownId = (e, events) => (challenged(events, e.of) ? null : `of ${e.of} names no challenge in the stream`);

// The API contract from issue #1, extended by spec #52. Dashboards depend on it. Its deliberate
// departures (parent, decision run, legacy transcript) are listed under "Event contract choices"
// in CONTEXT.md.
//   required  fields every event of the type carries (recorded as strings)
//   defaults  values for required fields the caller leaves out
//   parse     required fields whose value must also parse: each function returns a problem or null
//   stream    a rule against the stream so far, (event, events) => problem or null; the writer
//             reads the stream only for these types
//   json      required fields that hold JSON values (arrays, objects, numbers) as given
//   optional  fields an event may carry, each with the function that checks and normalizes it
// Any other field passes through as given: the lifecycle hook adds `report` and
// `report_truncated` to agent.stop (spec #52, CONTEXT.md).
const SCHEMA = {
  'agent.start': { required: ['role', 'parent'] },
  'agent.stop': { required: ['role', 'status'], enums: { status: ['PASS', 'ISSUES', 'BLOCKED'] } },
  artifact: { required: ['path', 'kind'] },
  'fetch.failed': { required: ['ref', 'url', 'reason'] },
  check: { required: ['name', 'result', 'evidence'], enums: { result: ['pass', 'fail'] }, optional: { ticket: ticketNumber } },
  // The ticket graph at a frontier step (issue #59): `spec` is the spec or map issue, `tickets`
  // one { number, state, status, blockers } per child, `blockers` its open blocked-by issues, and
  // optionally `stories`, the spec's user story numbers (issue #70).
  'ticket.graph': { required: [], json: { spec: Number.isInteger, tickets: Array.isArray } },
  // Issue #56: written by factory/hooks/dispatch.mjs into the orchestrator's file. `to` is the
  // agent dispatched or messaged (the stamped `agent` is the orchestrator). A dispatch may also
  // carry `resume: true` and `cause`; a message may carry `cause`. Either gets `cause_invalid: true`
  // when its cause is not a valid target.
  dispatch: { required: ['to', 'role', 'description', 'tool_use_id'], optional: { ticket: ticketNumber } },
  message: { required: ['to', 'tool_use_id'] },
  // A doubt raised against a row, event or pointer (issue #58), and its elimination by a later
  // event. Both are append-only: a challenge is never edited away.
  challenge: {
    required: ['id', 'target', 'kind', 'why'],
    defaults: { kind: 'rebut' },
    enums: { kind: ['rebut', 'undermine', 'undercut'] },
    parse: { id: plainName, target },
    optional: { ticket: ticketNumber },
    stream: newId,
  },
  'challenge.eliminated': { required: ['of', 'by'], parse: { of: plainName, by: target }, stream: knownId },
};

export const UNKNOWN = 'unknown';
const STAMPED = ['ts', 'run', 'agent', 'type'];
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

// An id from a hook payload made safe as a file name: characters outside [A-Za-z0-9._-] become _,
// leading punctuation goes, and a missing or emptied id is "unknown".
export function safeId(v) {
  return v ? String(v).replace(/[^A-Za-z0-9._-]/g, '_').replace(/^[._-]+/, '') || UNKNOWN : UNKNOWN;
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
  fields = { ...spec.defaults, ...fields };
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
  for (const [k, parse] of Object.entries(spec.parse || {})) {
    const problem = parse(event[k]);
    if (problem) throw new EventError(`${type}: ${k} ${problem}`);
  }
  for (const [k, valid] of Object.entries(spec.json || {})) {
    if (fields[k] === undefined) throw new EventError(`${type}: missing required field: ${k}`);
    if (!valid(fields[k])) throw new EventError(`${type}: field ${k} has the wrong shape`);
    event[k] = fields[k];
  }
  for (const [k, normalize] of Object.entries(spec.optional || {})) {
    if (fields[k] !== undefined) event[k] = normalize(fields[k]);
  }
  for (const [k, v] of Object.entries(fields)) {
    if (!(k in event) && v !== undefined) event[k] = v;
  }
  const problem = spec.stream?.(event, readStream(root));
  if (problem) throw new EventError(`${type}: ${problem}`);

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
