import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FACTORY, REPO } from './helpers.mjs';

const { parseArgs, row, HEADER } = await import('../../scripts/repo-meta.mjs').catch(() => ({}));
const fixture = JSON.parse(readFileSync(join(FACTORY, 'test', 'fixtures', 'gh-repo.json'), 'utf8'));
const CLI = join(REPO, 'scripts', 'repo-meta.mjs');

test('arguments: owner/repo names, and GitHub URLs reduced to them', () => {
  assert.deepEqual(parseArgs(['ollama/ollama', 'nmslib/hnswlib']), ['ollama/ollama', 'nmslib/hnswlib']);
  assert.deepEqual(parseArgs(['https://github.com/facebookresearch/faiss', 'https://github.com/a-b/c.d.git/']), ['facebookresearch/faiss', 'a-b/c.d']);
  assert.throws(() => parseArgs([]), /name at least one owner\/repo/);
  assert.throws(() => parseArgs(['ollama']), /not an owner\/repo: ollama/);
  assert.throws(() => parseArgs(['a/b; rm -rf /']), /not an owner\/repo/);
});

test('one TSV row per repo: name, SPDX license, stars, last push date, archived', () => {
  assert.equal(HEADER, 'repo\tlicense\tstars\tpushed\tarchived');
  assert.equal(row(fixture), 'nmslib/hnswlib\tApache-2.0\t5348\t2026-09-15\tfalse');
  // A repo with no license file: GitHub returns license: null.
  assert.equal(row({ ...fixture, full_name: 'x/y', license: null, archived: true }), 'x/y\tnone\t5348\t2026-09-15\ttrue');
});

test('the CLI rejects a bad name before calling gh', () => {
  const r = spawnSync(process.execPath, [CLI, 'not-a-repo'], { encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /not an owner\/repo: not-a-repo/);
});
