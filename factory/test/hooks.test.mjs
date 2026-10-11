import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readStream } from '../read.mjs';
import { REPO, hook, shell, tempRoot } from './helpers.mjs';

// Payloads shaped like Claude Code's (code.claude.com/docs/en/hooks.md, SubagentStart/SubagentStop).
const SESSION = '14c93a90-c178-4f4b-b20f-235aebe7f882';
const start = (over = {}) => ({
  session_id: SESSION,
  transcript_path: `C:\\Users\\me\\.claude\\projects\\p\\${SESSION}.jsonl`,
  cwd: 'C:\\repo\\.claude\\worktrees\\agent-a1b2',
  hook_event_name: 'SubagentStart',
  agent_id: 'a1b2c3d4e5f6',
  agent_type: 'general-purpose',
  ...over,
});
const stop = (over = {}) => ({
  session_id: SESSION,
  transcript_path: `C:\\Users\\me\\.claude\\projects\\p\\${SESSION}.jsonl`,
  cwd: 'C:\\repo\\.claude\\worktrees\\agent-a1b2',
  permission_mode: 'default',
  hook_event_name: 'SubagentStop',
  stop_hook_active: false,
  agent_id: 'a1b2c3d4e5f6',
  agent_type: 'general-purpose',
  agent_transcript_path: `C:\\Users\\me\\.claude\\projects\\p\\${SESSION}\\subagents\\agent-a1b2c3d4e5f6.jsonl`,
  last_assistant_message: 'PASS\n\nBranch: x. Tests: 31 pass.',
  background_tasks: [],
  session_crons: [],
  ...over,
});

const strip = ({ ts, ...rest }) => rest;

test('SubagentStart then SubagentStop record agent.start and agent.stop for that agent in the stream', () => {
  const root = tempRoot();
  const env = { CLAUDE_PROJECT_DIR: root };
  assert.equal(hook(start(), env).status, 0);
  assert.equal(hook(stop(), env).status, 0);

  const events = readStream(root);
  assert.deepEqual(events.map(strip), [
    { run: SESSION, agent: 'a1b2c3d4e5f6', type: 'agent.start', role: 'general-purpose', parent: 'orchestrator' },
    {
      run: SESSION, agent: 'a1b2c3d4e5f6', type: 'agent.stop', role: 'general-purpose', status: 'PASS',
      transcript: stop().agent_transcript_path,
    },
  ]);
});

test('the hook writes under CLAUDE_PROJECT_DIR, not the worktree it runs in', () => {
  const root = tempRoot();
  const worktree = tempRoot();
  assert.equal(hook(start(), { CLAUDE_PROJECT_DIR: root }, worktree).status, 0);
  assert.equal(readStream(root).length, 1);
  assert.deepEqual(readStream(worktree), []);
});

test('a hook payload missing the agent type records role unknown instead of dropping the event', () => {
  const root = tempRoot();
  const env = { CLAUDE_PROJECT_DIR: root };
  const { agent_type: _a, ...noTypeStart } = start();
  const { agent_type: _b, ...noTypeStop } = stop();
  assert.equal(hook(noTypeStart, env).status, 0);
  assert.equal(hook({ ...noTypeStop, agent_type: '' }, env).status, 0);

  const events = readStream(root);
  assert.deepEqual(events.map((e) => [e.type, e.role]), [['agent.start', 'unknown'], ['agent.stop', 'unknown']]);
});

// Claude Code's internal side agents (prompt suggestions, /btw) fire SubagentStop with an empty
// agent_type and never fire SubagentStart. They are not factory agents.
for (const [label, over] of [['empty', { agent_type: '' }], ['missing', { agent_type: undefined }]]) {
  test(`a SubagentStop with ${label} agent type for an agent that never started writes nothing`, () => {
    const root = tempRoot();
    const r = hook(stop({ ...over, agent_id: 'side1234', last_assistant_message: '', agent_transcript_path: 'C:\\nope\\agent-side1234.jsonl' }), { CLAUDE_PROJECT_DIR: root });
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(readStream(root), []);
  });
}

test('a SubagentStop with no agent type still records the stop of an agent that did start', () => {
  const root = tempRoot();
  const env = { CLAUDE_PROJECT_DIR: root };
  assert.equal(hook(start(), env).status, 0);
  assert.equal(hook(stop({ agent_type: '' }), env).status, 0);
  assert.deepEqual(readStream(root).map((e) => [e.type, e.role]), [['agent.start', 'general-purpose'], ['agent.stop', 'unknown']]);
});

test('a final message with no PASS, ISSUES or BLOCKED records status unknown', () => {
  const root = tempRoot();
  assert.equal(hook(stop({ last_assistant_message: 'Done, see the notes.' }), { CLAUDE_PROJECT_DIR: root }).status, 0);
  assert.equal(readStream(root)[0].status, 'unknown');
});

test('the status is the first PASS, ISSUES or BLOCKED in the final message', () => {
  const root = tempRoot();
  assert.equal(hook(stop({ last_assistant_message: 'Result: ISSUES. Two tables were BLOCKED by macros.' }), { CLAUDE_PROJECT_DIR: root }).status, 0);
  assert.equal(readStream(root)[0].status, 'ISSUES');
});

// Real subagents report through a SubagentHandback tool call, so last_assistant_message
// carries no status word (seen on the first real spawn, agent a8ac4f829492d7dc9).
const FIXTURES = join(REPO, 'factory', 'test', 'fixtures');
for (const [file, message, expected] of [
  ['transcript-handback.jsonl', '', 'PASS'],
  ['transcript-handback.jsonl', 'Report delivered.', 'PASS'],
  ['transcript-text.jsonl', '', 'ISSUES'],
  ['transcript-no-status.jsonl', '', 'unknown'],
  ['does-not-exist.jsonl', '', 'unknown'],
]) {
  test(`with no status in last_assistant_message, the status comes from the subagent transcript (${file}: ${expected})`, () => {
    const root = tempRoot();
    const r = hook(stop({ last_assistant_message: message, agent_transcript_path: join(FIXTURES, file) }), { CLAUDE_PROJECT_DIR: root });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(readStream(root)[0].status, expected);
  });
}

test('a status in last_assistant_message wins over the transcript', () => {
  const root = tempRoot();
  const r = hook(stop({ last_assistant_message: 'BLOCKED: login wall', agent_transcript_path: join(FIXTURES, 'transcript-handback.jsonl') }), { CLAUDE_PROJECT_DIR: root });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readStream(root)[0].status, 'BLOCKED');
});

test('a payload missing the agent id or session id still records the event, as unknown', () => {
  const root = tempRoot();
  const { agent_id: _a, session_id: _s, ...bare } = start();
  assert.equal(hook(bare, { CLAUDE_PROJECT_DIR: root }).status, 0);
  const [e] = readStream(root);
  assert.equal(e.agent, 'unknown');
  assert.equal(e.run, 'unknown');
});

test('SubagentStart tells the subagent its ids and a writer command that writes to its own file', () => {
  const root = tempRoot();
  const r = hook(start(), { CLAUDE_PROJECT_DIR: root });
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, 'SubagentStart');
  const ctx = out.hookSpecificOutput.additionalContext;
  assert.match(ctx, /agent id: a1b2c3d4e5f6/);
  assert.match(ctx, new RegExp(`run id: ${SESSION}`));

  // The subagent runs the command from its own worktree, as its Bash tool would.
  const cmd = ctx.match(/^ {4}(node .+)$/m)[1];
  const w = shell(`${cmd} artifact path=research/s1/notes/paper.md kind=notes`, tempRoot());
  assert.equal(w.status, 0, w.stderr);

  const events = readStream(root);
  assert.deepEqual(events.map((e) => [e.agent, e.run, e.type]), [
    ['a1b2c3d4e5f6', SESSION, 'agent.start'],
    ['a1b2c3d4e5f6', SESSION, 'artifact'],
  ]);
});

test('the hook commands registered in .claude/settings.json record start and stop when run by a POSIX shell', () => {
  const settings = JSON.parse(readFileSync(join(REPO, '.claude', 'settings.json'), 'utf8'));
  const root = tempRoot();
  for (const [event, payload] of [['SubagentStart', start()], ['SubagentStop', stop()]]) {
    const [group] = settings.hooks[event];
    assert.equal(group.matcher ?? '', '', `${event} must match every agent type`);
    // Claude Code runs shell-form hooks with Git Bash on Windows and sh elsewhere.
    const r = spawnSync('sh', ['-c', group.hooks[0].command], {
      input: JSON.stringify(payload), cwd: tempRoot(), encoding: 'utf8',
      env: { ...process.env, CLAUDE_PROJECT_DIR: REPO, FACTORY_ROOT: root },
    });
    assert.equal(r.status, 0, r.stderr || String(r.error));
  }
  assert.deepEqual(readStream(root).map((e) => e.type), ['agent.start', 'agent.stop']);
});

test('malformed hook input fails loudly and writes nothing', () => {
  const root = tempRoot();
  const r = hook('not json', { CLAUDE_PROJECT_DIR: root });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /subagent\.mjs/);
  assert.deepEqual(readStream(root), []);
});
