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

// The opening lines of the license texts, as their publishers print them.
const APACHE = '                                 Apache License\n                           Version 2.0, January 2004\n';
const MIT = 'MIT License\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\n';

const HEADER = 'key\ttitle\tstatus\tlicense\tfile\tnote';

// A fixture repo: `tracked` files are added to git, `untracked` files only written to disk, and
// the catalog gets one row per [key, license, file]. `listed` rows [file, license] go in
// research/licenses.tsv, the hand-kept list for raw files that are not cited references.
// `texts` maps a tracked path to its contents (other files hold "x").
function repo({ tracked = [], untracked = [], rows = [], listed, texts = {} }) {
  const root = tempRoot();
  const put = (path, text = 'x') => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  put('research/refs/catalog.tsv', [HEADER, ...rows.map(([key, license, file]) => `${key}\tT\tfetched\t${license}\t${file}\t`)].join('\n') + '\n');
  if (listed) put('research/licenses.tsv', ['file\tlicense\tsource', ...listed.map(([file, license]) => `${file}\t${license}\tfront matter`)].join('\n') + '\n');
  for (const p of [...tracked, ...untracked]) put(p, texts[p]);
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

t('a committed raw file with no license row fails, and the evidence names the file and both places a row can go', () => {
  const r = check(repo({ tracked: ['research/refs/foo/raw/paper.pdf'] }));
  assert.equal(r.status, 1, r.stderr + r.stdout);
  assert.equal(r.events.length, 1);
  assert.equal(r.events[0].name, 'licenses');
  assert.equal(r.events[0].result, 'fail');
  assert.match(r.events[0].evidence, /research\/refs\/foo\/raw\/paper\.pdf: no row in research\/refs\/catalog\.tsv or research\/licenses\.tsv/);
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

  const license = 'research/s1/raw/datasets/LICENSE';
  const withText = check(repo({ tracked: [card, license], rows, texts: { [license]: APACHE } }));
  assert.equal(withText.status, 0, withText.stderr + withText.stdout);
  assert.equal(withText.events[0].result, 'pass');
});

t('a raw file listed in research/licenses.tsv as own work passes; a README not on the list is still checked', () => {
  const r = check(repo({
    tracked: ['research/s1/raw/README.md', 'research/refs/x/raw/README.md'],
    listed: [['research/s1/raw/README.md', 'own work']],
  }));
  assert.equal(r.status, 1, r.stderr + r.stdout);
  assert.match(r.events[0].evidence, /research\/refs\/x\/raw\/README\.md: no row in /);
  assert.doesNotMatch(r.events[0].evidence, /research\/s1\/raw\/README\.md/);
});

t('a license recorded in research/licenses.tsv counts like a catalog row, and is held to the same allowlist', () => {
  const r = check(repo({
    tracked: ['research/s1/raw/datasets/s1K-1.1.md', 'research/s1/raw/datasets/other.md'],
    listed: [['research/s1/raw/datasets/s1K-1.1.md', 'MIT'], ['research/s1/raw/datasets/other.md', 'CC BY-ND 4.0']],
  }));
  assert.equal(r.status, 1, r.stderr + r.stdout);
  assert.match(r.events[0].evidence, /research\/s1\/raw\/datasets\/other\.md: license "CC BY-ND 4\.0" not allowlisted/);
  assert.doesNotMatch(r.events[0].evidence, /s1K-1\.1\.md/);
});

t('an Apache-2.0 raw file fails when the license text beside it is a different license', () => {
  const card = 'research/s1/raw/datasets/s1K.md';
  const mit = 'research/s1/raw/datasets/LICENSE-MIT.txt';
  const r = check(repo({ tracked: [card, mit], rows: [['s1K', 'Apache-2.0', card]], texts: { [mit]: MIT } }));
  assert.equal(r.status, 1, r.stderr + r.stdout);
  assert.match(r.events[0].evidence, /research\/s1\/raw\/datasets\/s1K\.md: Apache-2\.0 without its license text/);
});

t('a raw file named like a license text but holding no license text is checked like any other file', () => {
  const r = check(repo({ tracked: ['research/refs/x/raw/LICENSE-notes.md'] }));
  assert.equal(r.status, 1, r.stderr + r.stdout);
  assert.match(r.events[0].evidence, /research\/refs\/x\/raw\/LICENSE-notes\.md: no /);
});
