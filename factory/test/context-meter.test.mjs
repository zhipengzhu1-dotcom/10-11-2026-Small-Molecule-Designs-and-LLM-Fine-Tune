import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { FACTORY, REPO, marker, meter, tempRoot } from './helpers.mjs';

// Payloads shaped like Claude Code's UserPromptSubmit and PostToolUse (code.claude.com/docs/en/hooks.md).
const SESSION = '5e55f0c1-0000-4000-8000-000000000002';
const TRANSCRIPT = join(FACTORY, 'test', 'fixtures', 'transcript-meter.jsonl');
const prompt = (over = {}) => ({
  session_id: SESSION,
  transcript_path: TRANSCRIPT,
  cwd: 'C:\\repo',
  permission_mode: 'default',
  hook_event_name: 'UserPromptSubmit',
  prompt: 'Next ticket.',
  ...over,
});
const toolUse = (over = {}) => ({
  session_id: SESSION,
  transcript_path: TRANSCRIPT,
  cwd: 'C:\\repo',
  permission_mode: 'default',
  hook_event_name: 'PostToolUse',
  tool_name: 'Bash',
  tool_input: { command: 'npm test' },
  tool_response: { stdout: 'ok' },
  tool_use_id: 'toolu_9',
  ...over,
});

function runRoot(run = SESSION) {
  const root = tempRoot();
  const r = marker(['start', '--root', root, '--run', run, '--branch', 'spec1/leftovers']);
  assert.equal(r.status, 0, r.stderr);
  return root;
}

const injected = (r, event) => {
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, event);
  return out.hookSpecificOutput.additionalContext;
};

// Main-thread latest reply: 7 input + 148,000 cache read + 2,500 cache creation. The later
// sidechain reply (540,009) and the API error placeholder don't count.
test('in the orchestrated run, each prompt and tool call gets one short line with the context-token count', () => {
  const env = { CLAUDE_PROJECT_DIR: runRoot() };
  for (const [payload, event] of [[prompt(), 'UserPromptSubmit'], [toolUse(), 'PostToolUse']]) {
    const line = injected(meter(payload, env), event);
    assert.match(line, /\b150,507 tokens\b/);
    assert.equal(line.split('\n').length, 1);
    assert.ok(line.length <= 100, line);
  }
});

// Ordinary sessions in this repo (reflect, review, close-outs) get no extra text.
test('with no run marker, or one naming another run, the meter injects nothing', () => {
  for (const root of [tempRoot(), runRoot('0b5e7d2a-other-run')]) {
    for (const payload of [prompt(), toolUse()]) {
      const r = meter(payload, { CLAUDE_PROJECT_DIR: root });
      assert.equal(r.status, 0, r.stderr);
      assert.equal(r.stdout, '');
    }
  }
});

// PostToolUse also fires for a subagent's tool calls, with the subagent's agent_id. The count
// is the orchestrator's, so the subagent gets nothing.
test('a tool call inside a subagent gets nothing', () => {
  const r = meter(toolUse({ agent_id: 'a1b2c3d4e5f6', agent_type: 'general-purpose' }), { CLAUDE_PROJECT_DIR: runRoot() });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, '');
});

test('a transcript with no reply yet, or none on disk, gets nothing and no error', () => {
  const env = { CLAUDE_PROJECT_DIR: runRoot() };
  for (const transcript_path of [join(FACTORY, 'test', 'fixtures', 'transcript-text.jsonl'), join(FACTORY, 'test', 'fixtures', 'no-such.jsonl')]) {
    const r = meter(prompt({ transcript_path }), env);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, '');
  }
});

// Activity files for the overdue check (spec #52, stories 33 and 41): an earlier run where two
// implementers took 600 and 800 s, and this run's agents, all started on 2026-01-05, long before
// the test runs. Only an agent whose role has history from an earlier run can be overdue.
function withAgents(root, running) {
  const files = {
    'r0/orchestrator': [['dispatch', 0, { to: 'i1', role: 'implementer', ticket: 63 }], ['dispatch', 0, { to: 'i2', role: 'implementer', ticket: 64 }]],
    'r0/i1': [['agent.start', 0], ['agent.stop', 600]],
    'r0/i2': [['agent.start', 0], ['agent.stop', 800]],
    [`${SESSION}/orchestrator`]: running.map(([to, role]) => ['dispatch', 1000, { to, role, ticket: 68 }]),
    ...Object.fromEntries(running.map(([to]) => [`${SESSION}/${to}`, [['agent.start', 1000]]])),
  };
  for (const [file, events] of Object.entries(files)) {
    const [run, agent] = file.split('/');
    const dir = join(root, 'factory', 'agents', run);
    mkdirSync(dir, { recursive: true });
    const line = ([type, s, fields]) => JSON.stringify({ ts: new Date(Date.parse('2026-01-05T09:00:00Z') + s * 1000).toISOString(), run, agent, type, ...fields });
    writeFileSync(join(dir, `${agent}.jsonl`), events.map(line).join('\n') + '\n');
  }
  return root;
}

test('an agent running well past its role\'s earlier sojourns adds one line naming it, its role and ticket', () => {
  const env = { CLAUDE_PROJECT_DIR: withAgents(runRoot(), [['a68stuck', 'implementer']]) };
  for (const [payload, event] of [[prompt(), 'UserPromptSubmit'], [toolUse(), 'PostToolUse']]) {
    const lines = injected(meter(payload, env), event).split('\n');
    assert.equal(lines.length, 2, lines.join('\n'));
    assert.match(lines[0], /\b150,507 tokens\b/);
    assert.match(lines[1], /^Overdue: a68stuck \(implementer #68\) running \d+h\d{2}m, past its role's bound of 16m \(2 earlier sojourns\)\.$/);
  }
});

test('the meter\'s output is unchanged when no agent is overdue: a running agent whose role has no history adds nothing', () => {
  const clean = injected(meter(prompt(), { CLAUDE_PROJECT_DIR: runRoot() }), 'UserPromptSubmit');
  const env = { CLAUDE_PROJECT_DIR: withAgents(runRoot(), [['a68scout', 'scout']]) };
  assert.equal(injected(meter(prompt(), env), 'UserPromptSubmit'), clean);
});

test('.claude/settings.json runs the meter on every prompt and every tool call', () => {
  const settings = JSON.parse(readFileSync(join(REPO, '.claude', 'settings.json'), 'utf8'));
  for (const event of ['UserPromptSubmit', 'PostToolUse']) {
    const groups = (settings.hooks[event] ?? []).filter((g) => !g.matcher || g.matcher === '*');
    const commands = groups.flatMap((g) => g.hooks.map((h) => h.command));
    assert.ok(commands.some((c) => c.includes('factory/hooks/context-meter.mjs')), `${event}: ${commands}`);
  }
});
