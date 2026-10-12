import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { REPO, tempRoot } from './helpers.mjs';

// Every factory CLI that takes arguments, with the option whose value can dangle at the end.
// `takesRoot` CLIs get a temp --root first, so a bad argument never reaches the project's data.
const CLIS = [
  { script: 'factory/log.mjs', takesRoot: true, positionals: true },
  { script: 'factory/read.mjs', takesRoot: true },
  { script: 'factory/fetch-page.mjs', takesRoot: true, dangling: '--port' },
  { script: 'factory/checks/brief.mjs', takesRoot: true, dangling: '--brief' },
  { script: 'factory/checks/references.mjs', takesRoot: true, dangling: '--catalog' },
  { script: 'factory/checks/tables.mjs', takesRoot: true, dangling: '--notes' },
  { script: 'factory/checks/trail.mjs', takesRoot: true, dangling: '--transcripts' },
  { script: 'factory/checks/ticket.mjs', takesRoot: true, dangling: '--body' },
  { script: 'factory/run-marker.mjs', takesRoot: true, positionals: true, dangling: '--branch' },
  { script: 'scripts/catalog-refs.mjs', takesRoot: true, dangling: '--latex' },
  { script: 'scripts/fetch-s1.mjs', takesRoot: true, dangling: '--base-url' },
  { script: 'scripts/rules.mjs', takesRoot: true },
  { script: 'scripts/ci.mjs', takesRoot: false, dangling: '--rev' },
];

function run(script, args) {
  const env = { ...process.env };
  for (const k of ['FACTORY_ROOT', 'FACTORY_RUN', 'FACTORY_AGENT', 'CLAUDE_PROJECT_DIR']) delete env[k];
  // A CLI that ignored the bad argument could start a server; the timeout stops it.
  return spawnSync(process.execPath, [join(REPO, script), ...args], { cwd: tempRoot(), env, encoding: 'utf8', timeout: 10_000 });
}

for (const { script, takesRoot, positionals, dangling = '--root' } of CLIS) {
  const root = takesRoot ? ['--root', tempRoot()] : [];
  const bad = [['--bogus'], [dangling], [dangling, '--root', 'x']];
  if (!positionals) bad.push(['research/s1/brief.md']);
  for (const extra of bad) {
    test(`${script} ${extra.join(' ')} prints its usage and exits 2`, () => {
      const r = run(script, [...root, ...extra]);
      assert.equal(r.status, 2, r.stdout + r.stderr);
      assert.match(r.stderr, new RegExp(`usage: node ${script.replace(/[.]/g, '\\.')}`));
    });
  }
}
