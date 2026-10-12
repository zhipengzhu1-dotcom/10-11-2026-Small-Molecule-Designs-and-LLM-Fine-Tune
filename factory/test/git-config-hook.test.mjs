import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FACTORY, REPO } from './helpers.mjs';

const GIT_CONFIG_HOOK = join(FACTORY, 'hooks', 'git-config.mjs');

// PreToolUse payloads shaped like Claude Code's (code.claude.com/docs/en/hooks.md): a tool call
// made inside a subagent carries agent_id and agent_type; the main session's carries neither.
const SESSION = '14c93a90-c178-4f4b-b20f-235aebe7f882';
const call = (command, { tool = 'Bash', subagent = true } = {}) => ({
  session_id: SESSION,
  transcript_path: `C:\\Users\\me\\.claude\\projects\\p\\${SESSION}.jsonl`,
  cwd: 'C:\\repo\\.claude\\worktrees\\agent-a1b2',
  permission_mode: 'default',
  hook_event_name: 'PreToolUse',
  tool_name: tool,
  tool_input: { command, description: 'x' },
  tool_use_id: 'toolu_01ABC',
  ...(subagent ? { agent_id: 'a1b2c3d4e5f6', agent_type: 'general-purpose' } : {}),
});
const run = (payload) => spawnSync(process.execPath, [GIT_CONFIG_HOOK],
  { input: typeof payload === 'string' ? payload : JSON.stringify(payload), encoding: 'utf8' });

test('a subagent\'s git config write to the shared config is blocked with a message naming the fix', () => {
  // The #12 incident: an implementer in a worktree set core.hooksPath in the shared .git/config.
  const r = run(call('git config core.hooksPath .githooks'));
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /--worktree/);
  assert.match(r.stderr, /report/i);
});

for (const command of [
  'git config --unset core.hooksPath',
  'git config --global user.name "A B"',
  'git config --add remote.origin.fetch +refs/x',
  'git config set core.hooksPath .githooks',
  'git config --show-origin core.hooksPath .githooks',
  'git -C ../main config core.hooksPath .githooks',
  'cd sub && git config core.hooksPath .githooks',
  'npm run hooks:install',
]) {
  test(`a subagent's \`${command}\` is blocked`, () => {
    assert.equal(run(call(command)).status, 2);
  });
}

test('the PowerShell tool is checked too', () => {
  assert.equal(run(call('git config core.hooksPath .githooks', { tool: 'PowerShell' })).status, 2);
});

test('the main session, other tools and unreadable input pass', () => {
  assert.equal(run(call('git config core.hooksPath .githooks', { subagent: false })).status, 0);
  assert.equal(run({ ...call(''), tool_name: 'Read', tool_input: { file_path: 'a' } }).status, 0);
  assert.equal(run('not json').status, 0);
});

for (const command of [
  'git config --worktree core.hooksPath .githooks',
  'git config --global user.email',
  'git config --show-origin core.hooksPath',
  'git config --get core.hooksPath',
  'git config --get-regexp ^remote\\.',
  'git config --list --show-origin',
  'git config -l',
  'git config user.email',
  'git config --type=bool core.bare',
  'git config --type bool core.bare',
  'git config get core.hooksPath',
  'git config list',
  'git config core.hooksPath 2>&1',
  'git config user.email > out.txt',
  'git -c core.hooksPath=x status',
]) {
  test(`a subagent's \`${command}\` runs`, () => {
    const r = run(call(command));
    assert.equal(r.status, 0, r.stderr);
  });
}

test('.claude/settings.json runs the git config hook before every Bash and PowerShell call', () => {
  const settings = JSON.parse(readFileSync(join(REPO, '.claude', 'settings.json'), 'utf8'));
  for (const tool of ['Bash', 'PowerShell']) {
    const hooks = (settings.hooks.PreToolUse ?? [])
      .filter((h) => h.matcher.split(/\s*[|,]\s*/).includes(tool)).flatMap((h) => h.hooks);
    assert.ok(hooks.some((h) => h.command.includes('factory/hooks/git-config.mjs')), `${tool}: ${JSON.stringify(settings.hooks.PreToolUse)}`);
  }
});
