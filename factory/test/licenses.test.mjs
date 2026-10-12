import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { readStream } from '../read.mjs';
import { FACTORY, tempRoot } from './helpers.mjs';

const CHECK = join(FACTORY, 'checks', 'licenses.mjs');

// The check asks git which files are committed, so its tests need git (the Docker CI image has it).
const hasGit = spawnSync('git', ['--version']).status === 0;
const t = (name, fn) => test(name, { skip: !hasGit && 'git is not installed' }, fn);

const HEADER = 'key\ttitle\tstatus\tlicense\tfile\tnote';

// A fixture repo: `tracked` files are added to git, `untracked` files only written to disk, and
// the catalog gets one row per [key, license, file].
function repo({ tracked = [], untracked = [], rows = [] }) {
  const root = tempRoot();
  const put = (path, text = 'x') => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  put('research/refs/catalog.tsv', [HEADER, ...rows.map(([key, license, file]) => `${key}\tT\tfetched\t${license}\t${file}\t`)].join('\n') + '\n');
  for (const p of [...tracked, ...untracked]) put(p);
  const git = (...args) => spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  git('init', '-q');
  git('add', '--', 'research/refs/catalog.tsv', ...tracked);
  return root;
}

// Runs the check CLI the way CI does and returns its exit status plus the check events it wrote.
function check(root) {
  const r = spawnSync(process.execPath, [CHECK, '--root', root, '--run', 'run-1', '--agent', 'ci'], { encoding: 'utf8' });
  const events = readStream(root).filter((e) => e.type === 'check');
  return { ...r, events };
}

t('committed raw files under allowlisted licenses pass; gitignored raw files and files outside raw/ are not checked', () => {
  const r = check(repo({
    tracked: ['research/refs/a/raw/a.pdf', 'research/refs/b/raw/b.pdf', 'research/refs/c/raw/c.pdf',
      'research/s1/raw/datasets/s1K-1.1.md', 'research/s1/notes/paper.md'],
    // Present on disk but never added to git, as gitignored downloads are.
    untracked: ['research/refs/r1/raw/2501.12948.pdf'],
    rows: [
      ['a', 'CC BY 4.0', 'research/refs/a/raw/a.pdf'],
      ['b', 'CC BY-SA 4.0', 'research/refs/b/raw/b.pdf'],
      ['c', 'CC0 1.0', 'research/refs/c/raw/c.pdf'],
      ['s1K-1.1', 'MIT', 'research/s1/raw/datasets/s1K-1.1.md'],
      ['r1', 'arXiv nonexclusive-distrib 1.0', 'research/refs/r1/raw/2501.12948.pdf'],
    ],
  }));
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.equal(r.events.length, 1);
  assert.deepEqual([r.events[0].name, r.events[0].result, r.events[0].run, r.events[0].agent], ['licenses', 'pass', 'run-1', 'ci']);
  assert.match(r.events[0].evidence, /^4 committed raw files vs research\/refs\/catalog\.tsv/);
});

t('a committed raw file with no catalog entry fails, and the evidence names the file', () => {
  const r = check(repo({ tracked: ['research/refs/foo/raw/paper.pdf'] }));
  assert.equal(r.status, 1, r.stderr + r.stdout);
  assert.equal(r.events.length, 1);
  assert.equal(r.events[0].name, 'licenses');
  assert.equal(r.events[0].result, 'fail');
  assert.match(r.events[0].evidence, /research\/refs\/foo\/raw\/paper\.pdf: no catalog entry/);
});

t('a committed raw file whose license is not allowlisted fails, and the evidence names the file and license', () => {
  const r = check(repo({
    tracked: ['research/refs/r1/raw/2501.12948.pdf', 'research/refs/nc/raw/a.pdf', 'research/refs/web/raw/page.html'],
    rows: [
      ['r1', 'arXiv nonexclusive-distrib 1.0', 'research/refs/r1/raw/2501.12948.pdf'],
      ['nc', 'CC BY-NC 4.0', 'research/refs/nc/raw/a.pdf'],
      ['web', '', 'research/refs/web/raw/page.html'],
    ],
  }));
  assert.equal(r.status, 1, r.stderr + r.stdout);
  assert.equal(r.events[0].result, 'fail');
  assert.match(r.events[0].evidence, /research\/refs\/r1\/raw\/2501\.12948\.pdf: license "arXiv nonexclusive-distrib 1\.0" not allowlisted/);
  assert.match(r.events[0].evidence, /research\/refs\/nc\/raw\/a\.pdf: license "CC BY-NC 4\.0" not allowlisted/);
  assert.match(r.events[0].evidence, /research\/refs\/web\/raw\/page\.html: license "" not allowlisted/);
});

t('an Apache-2.0 raw file fails until its license text is committed beside it', () => {
  const card = 'research/s1/raw/datasets/s1K.md';
  const rows = [['s1K', 'Apache-2.0', card]];
  const bare = check(repo({ tracked: [card], untracked: ['research/s1/raw/datasets/LICENSE'], rows }));
  assert.equal(bare.status, 1, bare.stderr + bare.stdout);
  assert.match(bare.events[0].evidence, /research\/s1\/raw\/datasets\/s1K\.md: Apache-2\.0 without its license text/);

  const withText = check(repo({ tracked: [card, 'research/s1/raw/datasets/LICENSE'], rows }));
  assert.equal(withText.status, 0, withText.stderr + withText.stdout);
  assert.equal(withText.events[0].result, 'pass');
});
