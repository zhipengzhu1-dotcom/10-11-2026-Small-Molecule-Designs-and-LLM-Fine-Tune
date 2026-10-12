import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readStream } from '../read.mjs';
import { FACTORY, REPO, marker, tempRoot } from './helpers.mjs';

const HOOK = join(FACTORY, 'hooks', 'dispatch.mjs');

// Agent and SendMessage calls recorded in this project's orchestrator transcripts, with the
// agent.start events the lifecycle hook wrote for the same agents (see the fixture's _source).
const RECORDED = JSON.parse(readFileSync(join(FACTORY, 'test', 'fixtures', 'agent-dispatches.json'), 'utf8'));
const call = (toolUseId) => {
  const c = RECORDED.calls.find((x) => x.tool_use_id === toolUseId);
  assert.ok(c, toolUseId);
  return c;
};

// A PostToolUse payload shaped like Claude Code's (code.claude.com/docs/en/hooks.md) around a
// recorded call: tool_response is the call's recorded result. The orchestrator's own calls carry
// no agent_id; a subagent's carry one.
const payload = (recorded, over = {}) => ({
  session_id: recorded.session_id,
  transcript_path: `C:\\Users\\me\\.claude\\projects\\p\\${recorded.session_id}.jsonl`,
  cwd: 'C:\\repo',
  permission_mode: 'default',
  hook_event_name: 'PostToolUse',
  tool_name: recorded.tool_name,
  tool_input: recorded.tool_input,
  tool_response: recorded.tool_response,
  tool_use_id: recorded.tool_use_id,
  ...over,
});

const runHook = (p, root) => spawnSync(process.execPath, [HOOK], {
  input: typeof p === 'string' ? p : JSON.stringify(p),
  env: { ...process.env, FACTORY_ROOT: '', FACTORY_RUN: '', CLAUDE_PROJECT_DIR: root },
  encoding: 'utf8',
});

function runRoot(run) {
  const root = tempRoot();
  const r = marker(['start', '--root', root, '--run', run, '--branch', 'spec52/node-model']);
  assert.equal(r.status, 0, r.stderr);
  return root;
}

const strip = ({ ts, ...rest }) => rest;

// Recorded launches and resumes used below.
const LAUNCH_56 = call('toolu_01XE4vWVQAfoiA9t9VYJXiSu'); // implementer #56 dispatch events

test('a launch writes one dispatch in the orchestrator\'s activity file with agent, role, ticket, description and tool-use id', () => {
  const root = runRoot(LAUNCH_56.session_id);
  const r = runHook(payload(LAUNCH_56), root);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, '');
  assert.deepEqual(readStream(root).map(strip), [{
    run: '3ecf8aea-7d0f-4eca-87c2-e316fd7e8a6c',
    agent: 'orchestrator',
    type: 'dispatch',
    to: 'ac2d803fe514dbc00',
    role: 'implementer',
    description: 'implementer #56 dispatch events',
    tool_use_id: 'toolu_01XE4vWVQAfoiA9t9VYJXiSu',
    ticket: 56,
  }]);
});

test('a launch for work with no ticket (#-) writes a dispatch with no ticket', () => {
  const root = runRoot(LAUNCH_56.session_id);
  const input = { ...LAUNCH_56.tool_input, description: 'audit #- trail rows 77-87' };
  const r = runHook(payload(LAUNCH_56, { tool_input: input }), root);
  assert.equal(r.status, 0, r.stderr);
  const [e] = readStream(root);
  assert.equal(e.type, 'dispatch');
  assert.equal(e.role, 'audit');
  assert.equal(e.description, 'audit #- trail rows 77-87');
  assert.equal('ticket' in e, false);
});

// a52ce0ba launched a6e1a77 and resumed it twice once it had stopped.
const LAUNCH_MERGER = call('toolu_01EjxZXVvbtv42fKCZKbvUCU');
const RESUMES = [call('toolu_013hYNkpCEmHRvxVAKzegd97'), call('toolu_01WSHEx461SxyeWYmKJMa8rA')];

test('a resume writes a dispatch keyed by resumedAgentId, carrying the role, ticket and description of the agent\'s launch', () => {
  const root = runRoot(LAUNCH_MERGER.session_id);
  const launch = payload(LAUNCH_MERGER, { tool_input: { ...LAUNCH_MERGER.tool_input, description: 'merger #48 origin main into integration' } });
  for (const p of [launch, ...RESUMES.map((c) => payload(c))]) {
    const r = runHook(p, root);
    assert.equal(r.status, 0, r.stderr);
  }
  const events = readStream(root).map(strip);
  assert.equal(events.length, 3);
  const [first, ...resumes] = events;
  assert.equal('resume' in first, false);
  assert.deepEqual(resumes, RESUMES.map((c) => ({
    run: 'a52ce0ba-2c32-4437-97c2-3fc66317e832',
    agent: 'orchestrator',
    type: 'dispatch',
    to: 'a6e1a77aba05053f2',
    role: 'merger',
    description: 'merger #48 origin main into integration',
    tool_use_id: c.tool_use_id,
    ticket: 48,
    resume: true,
  })));
});

test('a resume of an agent with no dispatch on record writes a dispatch with role and description unknown', () => {
  const root = runRoot(RESUMES[0].session_id);
  const r = runHook(payload(RESUMES[0]), root);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(readStream(root).map(strip), [{
    run: 'a52ce0ba-2c32-4437-97c2-3fc66317e832',
    agent: 'orchestrator',
    type: 'dispatch',
    to: 'a6e1a77aba05053f2',
    role: 'unknown',
    description: 'unknown',
    tool_use_id: 'toolu_013hYNkpCEmHRvxVAKzegd97',
    resume: true,
  }]);
});

// 14c93a90 sent aca8839 a message while it was still running: Claude Code queued it, no resume.
const QUEUED = call('toolu_01Au4XvoAJgt8C5AFxcB1BQV');

test('a message to a running agent writes a message event (a cause edge), not a dispatch', () => {
  const root = runRoot(QUEUED.session_id);
  const r = runHook(payload(QUEUED), root);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(readStream(root).map(strip), [{
    run: '14c93a90-c178-4f4b-b20f-235aebe7f882',
    agent: 'orchestrator',
    type: 'message',
    to: 'aca88395f9aed1a30',
    tool_use_id: 'toolu_01Au4XvoAJgt8C5AFxcB1BQV',
  }]);
});

// d9d911bf's first try to resume a8de1f8 failed (success: false); nothing reached the agent.
test('a SendMessage that failed writes nothing', () => {
  const failed = call('toolu_01Lkb9qEsMFTBH3doK5ab9qn');
  const root = runRoot(failed.session_id);
  const r = runHook(payload(failed), root);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(readStream(root), []);
});

// The orchestrator names what prompted a dispatch or message on a line of its own in the prompt
// or message: `Cause: <pointer>` (spec #52, story 6).
test('a Cause: line in the prompt or message becomes the event\'s cause', () => {
  const root = runRoot(LAUNCH_MERGER.session_id);
  const launch = payload(LAUNCH_MERGER, { tool_input: { ...LAUNCH_MERGER.tool_input, description: 'merger #48 origin main', prompt: 'You are the merger.\nCause: row:94\nStart with git status.' } });
  const resume = payload(RESUMES[0], { tool_input: { ...RESUMES[0].tool_input, message: 'Fix the conflict.\n\nCause: event:a52ce0ba-2c32-4437-97c2-3fc66317e832/a6e1a77aba05053f2:4' } });
  const queued = payload({ ...QUEUED, session_id: LAUNCH_MERGER.session_id }, { tool_input: { ...QUEUED.tool_input, message: 'Cause: row:95\nAlso run the trail check.' } });
  for (const p of [launch, resume, queued]) assert.equal(runHook(p, root).status, 0);
  assert.deepEqual(readStream(root).map((e) => [e.type, e.cause]), [
    ['dispatch', 'row:94'],
    ['dispatch', 'event:a52ce0ba-2c32-4437-97c2-3fc66317e832/a6e1a77aba05053f2:4'],
    ['message', 'row:95'],
  ]);
  assert.ok(readStream(root).every((e) => !('cause_invalid' in e)));
});

// The launch already happened, so a PostToolUse hook can't refuse it: a cause that the target
// grammar (parseTarget in factory/pointer.mjs) rejects is kept as written and flagged.
test('a cause that isn\'t a valid target is still written, flagged cause_invalid', () => {
  const root = runRoot(LAUNCH_MERGER.session_id);
  const launch = payload(LAUNCH_MERGER, { tool_input: { ...LAUNCH_MERGER.tool_input, description: 'merger #48 origin main', prompt: 'Cause: row:ninety-four' } });
  const queued = payload({ ...QUEUED, session_id: LAUNCH_MERGER.session_id }, { tool_input: { ...QUEUED.tool_input, message: 'Cause: the-merge-failure\nRetry.' } });
  const resume = payload(RESUMES[0], { tool_input: { ...RESUMES[0].tool_input, message: 'Cause: transcript:a52ce0ba-2c32-4437-97c2-3fc66317e832@2026-10-12T06:09:00Z' } });
  for (const p of [launch, queued, resume]) assert.equal(runHook(p, root).status, 0);
  assert.deepEqual(readStream(root).map((e) => [e.type, e.cause, e.cause_invalid]), [
    ['dispatch', 'row:ninety-four', true],
    ['message', 'the-merge-failure', true],
    ['dispatch', 'transcript:a52ce0ba-2c32-4437-97c2-3fc66317e832@2026-10-12T06:09:00Z', undefined],
  ]);
});

test('outside an orchestrated run (no marker, or a marker naming another run) nothing is written', () => {
  for (const root of [tempRoot(), runRoot('0b5e7d2a-other-run')]) {
    for (const c of [LAUNCH_56, RESUMES[0], QUEUED]) {
      const r = runHook(payload(c), root);
      assert.equal(r.status, 0, r.stderr);
      assert.equal(r.stderr, '');
    }
    assert.deepEqual(readStream(root).filter((e) => e.agent === 'orchestrator'), []);
  }
});

// A subagent's own tool calls carry its agent_id: its launches and messages are not the orchestrator's.
test('a subagent\'s own Agent or SendMessage call writes nothing', () => {
  const root = runRoot(LAUNCH_56.session_id);
  for (const c of [LAUNCH_56, { ...QUEUED, session_id: LAUNCH_56.session_id }]) {
    const r = runHook(payload(c, { agent_id: 'ab60b2dc34aafc845', agent_type: 'general-purpose' }), root);
    assert.equal(r.status, 0, r.stderr);
  }
  assert.deepEqual(readStream(root), []);
});

test('another tool\'s call, or a payload that isn\'t JSON, writes nothing', () => {
  const root = runRoot(LAUNCH_56.session_id);
  const bash = payload(LAUNCH_56, { tool_name: 'Bash', tool_input: { command: 'ls' }, tool_response: { stdout: '', agentId: 'x' } });
  assert.equal(runHook(bash, root).status, 0);
  assert.equal(runHook('not json', root).status, 0);
  assert.deepEqual(readStream(root), []);
});

// The id join (spec #52, story 7). Every recorded launch and resume, fed through the hook, names
// in `to` the agent of exactly one recorded agent.start in the same run, started within seconds of
// the call's result; every recorded start is claimed by one dispatch. The queued message and the
// failed resume are followed by no start.
test('on recorded calls, each dispatch\'s agent is the agent_id of the agent.start it caused', () => {
  const NEAR_MS = 2000;
  const near = (start, c) => start.run === c.session_id && Math.abs(Date.parse(start.ts) - Date.parse(c.ts)) <= NEAR_MS;
  const claimed = new Set();
  let dispatches = 0;
  for (const run of new Set(RECORDED.calls.map((c) => c.session_id))) {
    const root = runRoot(run);
    const calls = RECORDED.calls.filter((c) => c.session_id === run);
    for (const c of calls) assert.equal(runHook(payload(c), root).status, 0);
    const written = new Map(readStream(root).map((e) => [e.tool_use_id, e]));
    for (const c of calls) {
      const e = written.get(c.tool_use_id);
      const startsNear = RECORDED.starts.filter((s) => near(s, c));
      if (e?.type !== 'dispatch') {
        assert.deepEqual(startsNear, [], `${c.tool_use_id}: no agent should start after a ${e?.type ?? 'failed call'}`);
        continue;
      }
      dispatches++;
      const joined = startsNear.filter((s) => s.agent === e.to);
      assert.equal(joined.length, 1, `${c.tool_use_id}: dispatch to ${e.to} joins ${joined.length} starts`);
      claimed.add(`${joined[0].run}/${joined[0].agent}/${joined[0].ts}`);
    }
  }
  assert.equal(dispatches, 12);
  assert.equal(claimed.size, RECORDED.starts.length);
});

test('.claude/settings.json runs the dispatch hook after every Agent and SendMessage call', () => {
  const settings = JSON.parse(readFileSync(join(REPO, '.claude', 'settings.json'), 'utf8'));
  for (const tool of ['Agent', 'SendMessage']) {
    const groups = (settings.hooks.PostToolUse ?? []).filter((g) => !g.matcher || new RegExp(`^(?:${g.matcher})$`).test(tool));
    const commands = groups.flatMap((g) => g.hooks.map((h) => h.command));
    assert.ok(commands.some((c) => c.includes('factory/hooks/dispatch.mjs')), `${tool}: ${commands}`);
  }
  const bash = (settings.hooks.PostToolUse ?? []).filter((g) => !g.matcher || new RegExp(`^(?:${g.matcher})$`).test('Bash'));
  assert.ok(!bash.flatMap((g) => g.hooks.map((h) => h.command)).some((c) => c.includes('dispatch.mjs')), 'not on every tool call');
});
