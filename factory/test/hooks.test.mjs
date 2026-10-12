import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readStream } from '../read.mjs';
import { REPO, hook, marker, shell, tempRoot } from './helpers.mjs';

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

// A main checkout where the orchestrator has marked its run active.
function runRoot(run = SESSION) {
  const root = tempRoot();
  const r = marker(['start', '--root', root, '--run', run, '--branch', 'spec1/leftovers']);
  assert.equal(r.status, 0, r.stderr);
  return root;
}

// Meta sessions (reflect, review, close-outs) fire the same hooks. Only an orchestrated run,
// marked by the orchestrator, is logged.
test('with no run marker, SubagentStart and SubagentStop write nothing and inject no writer instructions', () => {
  const root = tempRoot();
  const env = { CLAUDE_PROJECT_DIR: root };
  const s = hook(start(), env);
  assert.equal(s.status, 0, s.stderr);
  assert.equal(s.stdout, '');
  const t = hook(stop(), env);
  assert.equal(t.status, 0, t.stderr);
  assert.equal(t.stdout, '');
  assert.deepEqual(readStream(root), []);
  assert.equal(existsSync(join(root, 'factory', 'agents')), false);
});

// A meta session running beside an orchestrated run fires the hooks with its own session id.
test('with a run marker naming another run, the hooks write nothing and inject no writer instructions', () => {
  const root = runRoot('0b5e7d2a-other-run');
  const env = { CLAUDE_PROJECT_DIR: root };
  for (const payload of [start(), stop()]) {
    const r = hook(payload, env);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, '');
  }
  assert.deepEqual(readStream(root), []);
});

test('after the orchestrator clears the run marker, the hooks write nothing', () => {
  const root = runRoot();
  const env = { CLAUDE_PROJECT_DIR: root };
  assert.equal(hook(start(), env).status, 0);
  const r = marker(['stop', '--root', root]);
  assert.equal(r.status, 0, r.stderr);
  const s = hook(stop(), env);
  assert.equal(s.status, 0, s.stderr);
  assert.deepEqual(readStream(root).map((e) => e.type), ['agent.start']);
});

// The events carry the contract's fields and nothing else (issue #1, plus agent.stop's report from
// spec #52). The parent is always the orchestrator: Claude Code fires SubagentStart and
// SubagentStop only for agents the orchestrator session spawns, never for an agent a subagent
// spawns (issue #21).
test('SubagentStart then SubagentStop record agent.start and agent.stop for that agent in the stream', () => {
  const root = runRoot();
  const env = { CLAUDE_PROJECT_DIR: root };
  assert.equal(hook(start(), env).status, 0);
  assert.equal(hook(stop(), env).status, 0);

  const events = readStream(root);
  assert.deepEqual(events.map(strip), [
    { run: SESSION, agent: 'a1b2c3d4e5f6', type: 'agent.start', role: 'general-purpose', parent: 'orchestrator' },
    { run: SESSION, agent: 'a1b2c3d4e5f6', type: 'agent.stop', role: 'general-purpose', status: 'PASS', report: 'PASS\n\nBranch: x. Tests: 31 pass.' },
  ]);
});

test('the hook writes under CLAUDE_PROJECT_DIR, not the worktree it runs in', () => {
  const root = runRoot();
  const worktree = tempRoot();
  assert.equal(hook(start(), { CLAUDE_PROJECT_DIR: root }, worktree).status, 0);
  assert.equal(readStream(root).length, 1);
  assert.deepEqual(readStream(worktree), []);
});

test('a hook payload missing the agent type records role unknown instead of dropping the event', () => {
  const root = runRoot();
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
    const root = runRoot();
    const r = hook(stop({ ...over, agent_id: 'side1234', last_assistant_message: '', agent_transcript_path: 'C:\\nope\\agent-side1234.jsonl' }), { CLAUDE_PROJECT_DIR: root });
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(readStream(root), []);
  });
}

test('a SubagentStop with no agent type still records the stop of an agent that did start', () => {
  const root = runRoot();
  const env = { CLAUDE_PROJECT_DIR: root };
  assert.equal(hook(start(), env).status, 0);
  assert.equal(hook(stop({ agent_type: '' }), env).status, 0);
  assert.deepEqual(readStream(root).map((e) => [e.type, e.role]), [['agent.start', 'general-purpose'], ['agent.stop', 'unknown']]);
});

test('a final message with no PASS, ISSUES or BLOCKED records status unknown', () => {
  const root = runRoot();
  assert.equal(hook(stop({ last_assistant_message: 'Done, see the notes.' }), { CLAUDE_PROJECT_DIR: root }).status, 0);
  assert.equal(readStream(root)[0].status, 'unknown');
});

test('the status is the first PASS, ISSUES or BLOCKED in the final message', () => {
  const root = runRoot();
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
    const root = runRoot();
    const r = hook(stop({ last_assistant_message: message, agent_transcript_path: join(FIXTURES, file) }), { CLAUDE_PROJECT_DIR: root });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(readStream(root)[0].status, expected);
  });
}

test('a status in last_assistant_message wins over the transcript', () => {
  const root = runRoot();
  const r = hook(stop({ last_assistant_message: 'BLOCKED: login wall', agent_transcript_path: join(FIXTURES, 'transcript-handback.jsonl') }), { CLAUDE_PROJECT_DIR: root });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readStream(root)[0].status, 'BLOCKED');
});

// The hand-back report is logged whole on agent.stop, so it can be searched without the
// transcript (spec #52, story 8).
test('a stop that handed back through SubagentHandback logs its full text as report', () => {
  const root = runRoot();
  const r = hook(stop({ last_assistant_message: 'Report delivered.', agent_transcript_path: join(FIXTURES, 'transcript-handback.jsonl') }), { CLAUDE_PROJECT_DIR: root });
  assert.equal(r.status, 0, r.stderr);
  const [e] = readStream(root);
  assert.equal(e.report, 'PASS: ran the writer once and it exited 0.');
  assert.equal('report_truncated' in e, false);
});

test('a stop with no report text anywhere writes no report field', () => {
  const root = runRoot();
  const r = hook(stop({ last_assistant_message: '', agent_transcript_path: join(FIXTURES, 'does-not-exist.jsonl') }), { CLAUDE_PROJECT_DIR: root });
  assert.equal(r.status, 0, r.stderr);
  const [e] = readStream(root);
  assert.equal(e.status, 'unknown');
  assert.equal('report' in e, false);
  assert.equal('report_truncated' in e, false);
});

// A subagent transcript whose SubagentHandback carries `message`.
function handbackTranscript(message) {
  const file = join(tempRoot(), 'agent-long.jsonl');
  const content = [{ type: 'tool_use', id: 'toolu_9', name: 'SubagentHandback', input: { message } }];
  writeFileSync(file, JSON.stringify({ type: 'assistant', message: { role: 'assistant', content } }) + '\n');
  return file;
}

const CAP = 64 * 1024;
for (const [label, length, truncated] of [['at', CAP, false], ['over', CAP + 5000, true]]) {
  test(`a report ${label} the 64k-character cap is ${truncated ? 'cut to the cap and flagged report_truncated' : 'kept whole'}`, () => {
    const root = runRoot();
    const text = 'PASS ' + 'r'.repeat(length - 5);
    const r = hook(stop({ last_assistant_message: '', agent_transcript_path: handbackTranscript(text) }), { CLAUDE_PROJECT_DIR: root });
    assert.equal(r.status, 0, r.stderr);
    const [e] = readStream(root);
    assert.equal(e.status, 'PASS');
    assert.equal(e.report, text.slice(0, CAP));
    if (truncated) assert.equal(e.report_truncated, true);
    else assert.equal('report_truncated' in e, false);
  });
}

test('a payload missing the agent id or session id still records the event, as unknown', () => {
  const root = runRoot();
  const { agent_id: _a, session_id: _s, ...bare } = start();
  assert.equal(hook(bare, { CLAUDE_PROJECT_DIR: root }).status, 0);
  const [e] = readStream(root);
  assert.equal(e.agent, 'unknown');
  assert.equal(e.run, 'unknown');
});

test('SubagentStart tells the subagent its ids and a writer command that writes to its own file', () => {
  const root = runRoot();
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

// Claude Code runs shell-form hooks with Git Bash on Windows and sh elsewhere. Git Bash's sh is not
// on PATH under PowerShell, so it is found from git's own install folder.
function posixShell() {
  if (!spawnSync('sh', ['-c', 'exit 0']).error) return 'sh';
  const gitCore = spawnSync('git', ['--exec-path'], { encoding: 'utf8' }).stdout?.trim();
  const gitBashSh = gitCore && join(gitCore, '..', '..', '..', 'bin', 'sh.exe');
  return gitBashSh && existsSync(gitBashSh) ? gitBashSh : null;
}
const SH = posixShell();

test('the hook commands registered in .claude/settings.json record start and stop when run by a POSIX shell', { skip: !SH && 'no POSIX shell found' }, () => {
  const settings = JSON.parse(readFileSync(join(REPO, '.claude', 'settings.json'), 'utf8'));
  const root = runRoot();
  for (const [event, payload] of [['SubagentStart', start()], ['SubagentStop', stop()]]) {
    const [group] = settings.hooks[event];
    assert.equal(group.matcher ?? '', '', `${event} must match every agent type`);
    const r = spawnSync(SH, ['-c', group.hooks[0].command], {
      input: JSON.stringify(payload), cwd: tempRoot(), encoding: 'utf8',
      env: { ...process.env, CLAUDE_PROJECT_DIR: REPO, FACTORY_ROOT: root },
    });
    assert.equal(r.status, 0, r.stderr || String(r.error));
  }
  assert.deepEqual(readStream(root).map((e) => e.type), ['agent.start', 'agent.stop']);
});

test('malformed hook input fails loudly and writes nothing', () => {
  const root = runRoot();
  const r = hook('not json', { CLAUDE_PROJECT_DIR: root });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /subagent\.mjs/);
  assert.deepEqual(readStream(root), []);
});
