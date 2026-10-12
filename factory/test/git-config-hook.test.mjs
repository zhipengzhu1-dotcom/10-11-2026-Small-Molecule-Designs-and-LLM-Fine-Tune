import { test as nodeTest } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FACTORY, REPO, tempRoot } from './helpers.mjs';

const GIT_CONFIG_HOOK = join(FACTORY, 'hooks', 'git-config.mjs');

// The hook asks git which repo a write lands in, so its tests need git (the CI image has it).
const hasGit = spawnSync('git', ['--version']).status === 0;
const test = (name, fn) => nodeTest(name, { skip: !hasGit && 'git is not installed' }, fn);

// A fixture project (a git repo, as CLAUDE_PROJECT_DIR names it) with a subagent's worktree folder
// inside it, and a throwaway repo elsewhere, as a subagent's test fixtures make.
const gitInit = (dir) => spawnSync('git', ['init', '-q', dir]);
const PROJECT = tempRoot();
gitInit(PROJECT);
const WORKTREE = join(PROJECT, '.claude', 'worktrees', 'agent-a1b2');
mkdirSync(WORKTREE, { recursive: true });
const SCRATCH = tempRoot();
gitInit(SCRATCH);

// PreToolUse payloads shaped like Claude Code's (code.claude.com/docs/en/hooks.md): a tool call
// made inside a subagent carries agent_id and agent_type; the main session's carries neither.
const SESSION = '14c93a90-c178-4f4b-b20f-235aebe7f882';
const call = (command, { tool = 'Bash', subagent = true, cwd = WORKTREE } = {}) => ({
  session_id: SESSION,
  transcript_path: `C:\\Users\\me\\.claude\\projects\\p\\${SESSION}.jsonl`,
  cwd,
  permission_mode: 'default',
  hook_event_name: 'PreToolUse',
  tool_name: tool,
  tool_input: { command, description: 'x' },
  tool_use_id: 'toolu_01ABC',
  ...(subagent ? { agent_id: 'a1b2c3d4e5f6', agent_type: 'general-purpose' } : {}),
});
const run = (payload) => spawnSync(process.execPath, [GIT_CONFIG_HOOK], {
  input: typeof payload === 'string' ? payload : JSON.stringify(payload),
  env: { ...process.env, CLAUDE_PROJECT_DIR: PROJECT },
  encoding: 'utf8',
});

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
  'echo "a; b" ; git config core.hooksPath .githooks',
  'cat > f <<\'EOF\'\nx\nEOF\ngit config core.hooksPath .githooks',
  'npm run hooks:install',
]) {
  test(`a subagent's \`${command}\` is blocked`, () => {
    assert.equal(run(call(command)).status, 2);
  });
}

test('the PowerShell tool is checked too', () => {
  assert.equal(run(call('git config core.hooksPath .githooks', { tool: 'PowerShell' })).status, 2);
  assert.equal(run(call('C:\\Git\\cmd\\git.exe config core.hooksPath .githooks', { tool: 'PowerShell' })).status, 2);
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
  // Quoted text and heredoc bodies are data, not commands (merger's find on #15).
  'echo "a; git config core.hooksPath .githooks"',
  'echo \'a && git config core.hooksPath x\' | cat',
  'gh api repos/x -f body=\'{"note": "run | git config core.x y"}\'',
  'node -e "console.log(1); git config core.x y"',
  'cat > notes.md <<\'EOF\'\nThen: git config core.hooksPath .githooks\nEOF',
  'cat > notes.md <<EOF\na; git config core.x y\nEOF',
]) {
  test(`a subagent's \`${command}\` runs`, () => {
    const r = run(call(command));
    assert.equal(r.status, 0, r.stderr);
  });
}

// Commands run inside another command: substitutions and shells handed a command string.
for (const [command, tool = 'Bash'] of [
  ['x=$(git config core.hooksPath .githooks)'],
  ['echo "hooks: $(git config core.hooksPath .githooks)"'],
  ['bash -c "git config core.hooksPath .githooks"'],
  ["sh -c 'cd sub && git config core.x y'"],
  ['cmd /c git config core.hooksPath .githooks'],
  ['cmd /c "git config core.hooksPath .githooks"'],
  ['powershell -NoProfile -Command "git config core.x y"', 'PowerShell'],
  ['Write-Output "$(git config core.x y)"', 'PowerShell'],
]) {
  test(`a subagent's \`${command}\` is blocked`, () => {
    assert.equal(run(call(command, { tool })).status, 2);
  });
}

const slash = (p) => p.replace(/\\/g, '/');

test('a write to the shared config through --file is blocked; one to any other file runs', () => {
  assert.equal(run(call(`git config -f "${slash(join(PROJECT, '.git', 'config'))}" core.x y`)).status, 2);
  assert.equal(run(call('git config -f other.cfg core.x y')).status, 0);
  assert.equal(run(call('git config --file=other.cfg core.x y')).status, 0);
});

test('a subagent\'s git config write in a throwaway repo outside the project runs', () => {
  const scratch = slash(SCRATCH);
  const fresh = slash(join(tempRoot(), 'new'));
  for (const [command, opts] of [
    ['git config user.name x', { cwd: SCRATCH }],
    [`git -C "${scratch}" config user.name x`],
    [`cd "${scratch}" && git config user.name x`],
    [`Set-Location "${scratch}"; git config user.name x`, { tool: 'PowerShell' }],
    [`git init -q "${fresh}" && git -C "${fresh}" config user.name x`],
  ]) {
    const r = run(call(command, opts));
    assert.equal(r.status, 0, `${command}: ${r.stderr}`);
  }
});

test('a write to the global config is blocked even from a throwaway repo', () => {
  assert.equal(run(call('git config --global user.name x', { cwd: SCRATCH })).status, 2);
});

test('a substitution inside single quotes is data', () => {
  assert.equal(run(call("echo '$(git config core.x y)'")).status, 0);
});

test('.claude/settings.json runs the git config hook before every Bash and PowerShell call', () => {
  const settings = JSON.parse(readFileSync(join(REPO, '.claude', 'settings.json'), 'utf8'));
  for (const tool of ['Bash', 'PowerShell']) {
    const hooks = (settings.hooks.PreToolUse ?? [])
      .filter((h) => h.matcher.split(/\s*[|,]\s*/).includes(tool)).flatMap((h) => h.hooks);
    assert.ok(hooks.some((h) => h.command.includes('factory/hooks/git-config.mjs')), `${tool}: ${JSON.stringify(settings.hooks.PreToolUse)}`);
  }
});
