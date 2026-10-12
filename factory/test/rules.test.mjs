import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FACTORY, REPO } from './helpers.mjs';

const RULES = join(REPO, 'scripts', 'rules.mjs');
const HEREDOC_HOOK = join(FACTORY, 'hooks', 'long-heredoc.mjs');
const { liveDataUses } = await import('../../scripts/rules.mjs').catch(() => ({}));

test('a test that reads the project\'s live data is caught, naming the line', () => {
  // The s1 decisions test (51c3b99) asserted on the real log, so every new row broke the test gate.
  const past = "test('seeded', () => {\n  const decisions = readStream(REPO).filter((e) => e.type === 'decision');\n});\n";
  assert.deepEqual(liveDataUses(past), [{ line: 2, text: "const decisions = readStream(REPO).filter((e) => e.type === 'decision');" }]);
  assert.equal(liveDataUses("const settings = JSON.parse(readFileSync(join(REPO, '.claude', 'settings.json'), 'utf8'));").length, 0);
  assert.equal(liveDataUses("writeFileSync(join(root, 'factory', 'decisions.tsv'), rows);").length, 0);
  assert.equal(liveDataUses("readFileSync(join(REPO, 'research', 'refs', 'catalog.tsv'))").length, 1);
  assert.equal(liveDataUses("spawnSync(node, [CHECK, '--root', REPO])").length, 1);
});

test('the repo passes its own rules: no hosted CI workflows and no test reading live data', () => {
  const r = spawnSync(process.execPath, [RULES, '--root', REPO], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(existsSync(join(REPO, '.github', 'workflows')), false);
  assert.ok(readdirSync(join(FACTORY, 'test')).length > 0);
});

// Runs the PreToolUse hook the way Claude Code does: the tool call as JSON on stdin.
const heredocHook = (command) => spawnSync(process.execPath, [HEREDOC_HOOK],
  { input: JSON.stringify({ tool_name: 'Bash', tool_input: { command } }), encoding: 'utf8' });

const heredoc = (file, lines) => `cat > ${file} <<'EOF'\n${Array.from({ length: lines }, (_, i) => `line ${i} it's here`).join('\n')}\nEOF`;

test('a Bash command carrying a long heredoc is blocked with a message naming the Write tool and --body-file', () => {
  // The two failures (3dfa7c0b 20:48, 83506eeb 00:08) wrote several issue bodies in one command.
  const r = heredocHook(`cd /tmp/issues\n${heredoc('02.md', 30)}\n${heredoc('03.md', 30)}`);
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /60 lines of heredoc text/);
  assert.match(r.stderr, /Write tool/);
  assert.match(r.stderr, /--body-file/);
});

test('short heredocs, such as a commit message, and other tools pass', () => {
  assert.equal(heredocHook(`git commit -F - <<'EOF'\n${'x\n'.repeat(20)}EOF`).status, 0);
  const other = spawnSync(process.execPath, [HEREDOC_HOOK], { input: JSON.stringify({ tool_name: 'Read', tool_input: { file_path: 'a' } }), encoding: 'utf8' });
  assert.equal(other.status, 0);
  assert.equal(spawnSync(process.execPath, [HEREDOC_HOOK], { input: 'not json', encoding: 'utf8' }).status, 0);
});

test('.claude/settings.json runs the heredoc hook before every Bash call', () => {
  const settings = JSON.parse(readFileSync(join(REPO, '.claude', 'settings.json'), 'utf8'));
  const bash = (settings.hooks.PreToolUse ?? []).filter((h) => h.matcher === 'Bash').flatMap((h) => h.hooks);
  assert.ok(bash.some((h) => h.command.includes('factory/hooks/long-heredoc.mjs')), JSON.stringify(settings.hooks.PreToolUse));
});
