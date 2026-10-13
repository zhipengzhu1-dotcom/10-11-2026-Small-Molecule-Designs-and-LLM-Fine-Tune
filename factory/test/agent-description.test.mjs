import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseDescription } from '../description.mjs';
import { FACTORY, REPO, marker, tempRoot } from './helpers.mjs';

const HOOK = join(FACTORY, 'hooks', 'agent-description.mjs');

// Agent launches recorded in this project's transcripts, keyed by description.
const RECORDED = Object.fromEntries(
  JSON.parse(readFileSync(join(FACTORY, 'test', 'fixtures', 'agent-launches.json'), 'utf8'))
    .launches.map((l) => [l.tool_input.description, l]),
);

// A PreToolUse payload shaped like Claude Code's (code.claude.com/docs/en/hooks.md) around a
// recorded launch. The orchestrator's own calls carry no agent_id; a subagent's carry one.
const SESSION = '3ecf8aea-7d0f-4eca-87c2-e316fd7e8a6c';
const launch = (description, over = {}) => {
  const recorded = RECORDED[description];
  return {
    session_id: SESSION,
    transcript_path: `C:\\Users\\me\\.claude\\projects\\p\\${SESSION}.jsonl`,
    cwd: 'C:\\repo',
    permission_mode: 'default',
    hook_event_name: 'PreToolUse',
    tool_name: 'Agent',
    tool_input: recorded ? recorded.tool_input : { description, prompt: 'Do the thing.', subagent_type: 'general-purpose' },
    tool_use_id: recorded ? recorded.tool_use_id : 'toolu_01TEST',
    ...over,
  };
};

const runHook = (payload, root) => spawnSync(process.execPath, [HOOK], {
  input: typeof payload === 'string' ? payload : JSON.stringify(payload),
  env: { ...process.env, FACTORY_ROOT: '', FACTORY_RUN: '', CLAUDE_PROJECT_DIR: root },
  encoding: 'utf8',
});

function runRoot(run = SESSION) {
  const root = tempRoot();
  const r = marker(['start', '--root', root, '--run', run, '--branch', 'spec52/node-model']);
  assert.equal(r.status, 0, r.stderr);
  return root;
}

test('in an orchestrated run, a launch whose description breaks the grammar is denied with the grammar shown', () => {
  const root = runRoot();
  for (const description of ['Implement #13 hook marker', 'Audit decision rows 77-87', 'Code review: spec axis', '#10 reader: AIME']) {
    const r = runHook(launch(description), root);
    assert.equal(r.status, 2, `${description}: ${r.stderr}`);
    assert.match(r.stderr, /<role> #<n\|-> <what>/);
    assert.ok(r.stderr.includes(description), r.stderr);
  }
});

test('in an orchestrated run, a launch that follows the grammar goes ahead', () => {
  const root = runRoot();
  for (const description of ['implementer #55 description grammar hook', 'merger #53 into integration', 'code-review #52 spec axis']) {
    const r = runHook(launch(description), root);
    assert.equal(r.status, 0, `${description}: ${r.stderr}`);
    assert.equal(r.stderr, '');
  }
});

test('#- is accepted for work with no ticket', () => {
  const root = runRoot();
  for (const description of ['audit #- trail rows 77-87', 'reviewer #- standards axis', 'reflect #- spec 52 retro']) {
    const r = runHook(launch(description), root);
    assert.equal(r.status, 0, `${description}: ${r.stderr}`);
  }
});

test('with no run marked, or a marker naming another run, a malformed description is allowed', () => {
  for (const root of [tempRoot(), runRoot('0b5e7d2a-other-run')]) {
    const r = runHook(launch('Implement #13 hook marker'), root);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stderr, '');
  }
});

// A subagent's own tool calls carry its agent_id. The grammar binds the orchestrator's launches only.
test('a subagent\'s own Agent call is not checked', () => {
  const r = runHook(launch('Code review: spec axis', { agent_id: 'ab60b2dc34aafc845', agent_type: 'general-purpose' }), runRoot());
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr, '');
});

test('in an orchestrated run, a description that is missing, empty or lacks a part is denied', () => {
  const root = runRoot();
  for (const description of [undefined, '', 'implementer #55', 'implementer 55 grammar hook', '#55 grammar hook', 'implementer #5a grammar', 'implementer #-grammar']) {
    const payload = launch('x');
    payload.tool_input = { prompt: 'Do the thing.', ...(description === undefined ? {} : { description }) };
    const r = runHook(payload, root);
    assert.equal(r.status, 2, `${description}: ${r.stderr}`);
  }
});

test('a payload that isn\'t JSON, or another tool\'s call, passes', () => {
  const root = runRoot();
  assert.equal(runHook('not json', root).status, 0);
  const bash = launch('x', { tool_name: 'Bash', tool_input: { command: 'ls', description: 'List files' } });
  assert.equal(runHook(bash, root).status, 0);
});

// The dispatch event (issue #56) reads role and ticket through the same parser.
test('the shared parser gives the role, the ticket number (null for #-) and what the agent does', () => {
  assert.deepEqual(parseDescription('implementer #55 description grammar hook'), { role: 'implementer', ticket: 55, what: 'description grammar hook' });
  assert.deepEqual(parseDescription('audit #- trail rows 77-87'), { role: 'audit', ticket: null, what: 'trail rows 77-87' });
  assert.equal(parseDescription('Implement #13 hook marker'), null);
});

test('.claude/settings.json runs the description hook before every Agent launch', () => {
  const settings = JSON.parse(readFileSync(join(REPO, '.claude', 'settings.json'), 'utf8'));
  const groups = (settings.hooks.PreToolUse ?? []).filter((g) => g.matcher && new RegExp(`^(?:${g.matcher})$`).test('Agent'));
  const commands = groups.flatMap((g) => g.hooks.map((h) => h.command));
  assert.ok(commands.some((c) => c.includes('factory/hooks/agent-description.mjs')), String(commands));
});
