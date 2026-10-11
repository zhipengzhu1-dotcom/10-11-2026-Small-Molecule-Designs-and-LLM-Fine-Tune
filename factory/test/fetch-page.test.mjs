import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readStream } from '../read.mjs';
import { startFetchPage, tempRoot, write } from './helpers.mjs';

function failed(root, ref, extra = []) {
  const r = write(['--root', root, '--run', 'run-1', '--agent', 'fetcher', 'fetch.failed',
    `ref=${ref}`, `url=https://example.org/${ref}.pdf`, 'reason=HTTP 403', ...extra]);
  assert.equal(r.status, 0, r.stderr);
}

async function withPage(root, fn) {
  const page = await startFetchPage(['--root', root]);
  try {
    await fn(page.url);
  } finally {
    await page.stop();
  }
}

const drop = (url, ref, name, body, headers = {}) =>
  fetch(`${url}/drop?ref=${encodeURIComponent(ref)}&name=${encodeURIComponent(name)}`, { method: 'POST', body, headers });

test('dropping a file for an open fetch.failed ref saves it in that ref\'s raw folder and logs an artifact event', async () => {
  const root = tempRoot();
  failed(root, 'qwen2025');
  await withPage(root, async (url) => {
    const res = await drop(url, 'qwen2025', 'qwen.pdf', '%PDF-1.4 fake');
    assert.equal(res.status, 201, await res.text());
  });

  assert.equal(readFileSync(join(root, 'research', 'refs', 'qwen2025', 'raw', 'qwen.pdf'), 'utf8'), '%PDF-1.4 fake');
  const artifacts = readStream(root).filter((e) => e.type === 'artifact');
  assert.equal(artifacts.length, 1);
  assert.equal(artifacts[0].path, 'research/refs/qwen2025/raw/qwen.pdf');
  assert.equal(artifacts[0].kind, 'ref');
  assert.equal(artifacts[0].ref, 'qwen2025');
});

test('a drop for a ref with no open fetch.failed event is rejected and writes nothing', async () => {
  const root = tempRoot();
  failed(root, 'qwen2025');
  await withPage(root, async (url) => {
    for (const ref of ['nobody2024', '../../factory', '']) {
      const res = await drop(url, ref, 'x.pdf', 'data');
      assert.equal(res.status, 404, `ref ${ref}`);
    }
    // closed once its file has been dropped
    assert.equal((await drop(url, 'qwen2025', 'a.pdf', 'one')).status, 201);
    assert.equal((await drop(url, 'qwen2025', 'b.pdf', 'two')).status, 404);
  });
  assert.equal(existsSync(join(root, 'research', 'refs', 'nobody2024')), false);
  assert.equal(existsSync(join(root, 'research', 'refs', 'qwen2025', 'raw', 'b.pdf')), false);
  assert.deepEqual(readStream(root).filter((e) => e.type === 'artifact').map((e) => e.path), ['research/refs/qwen2025/raw/a.pdf']);
});

const artifactPaths = (root) => readStream(root).filter((e) => e.type === 'artifact').map((e) => e.path);

test('a dropped filename that tries to leave the raw folder is reduced to a plain name inside it', async () => {
  const cases = [
    ['../../../factory/log.mjs', 'log.mjs'],
    ['..\\..\\evil.pdf', 'evil.pdf'],
    ['C:\\Windows\\x.pdf', 'x.pdf'],
    ['..', 'file'],
    ['.hidden', 'hidden'],
    ['we ird:na*me?.pdf', 'we_ird_na_me_.pdf'],
  ];
  for (const [name, saved] of cases) {
    const root = tempRoot();
    failed(root, 'qwen2025');
    await withPage(root, async (url) => {
      const res = await drop(url, 'qwen2025', name, 'data');
      assert.equal(res.status, 201, name);
    });
    assert.deepEqual(readdirSync(join(root, 'research', 'refs', 'qwen2025', 'raw')), [saved], name);
    assert.deepEqual(artifactPaths(root), [`research/refs/qwen2025/raw/${saved}`], name);
    assert.equal(readdirSync(join(root, 'factory')).sort().join(), 'agents', name);
  }
});

test('a fetch.failed ref that is not a plain folder name cannot be used as a drop target', async () => {
  const root = tempRoot();
  failed(root, '../escape');
  failed(root, 'Wei:2022');
  await withPage(root, async (url) => {
    for (const ref of ['../escape', 'Wei:2022']) {
      const res = await drop(url, ref, 'x.pdf', 'data');
      assert.equal(res.status, 400, ref);
    }
  });
  assert.equal(existsSync(join(root, 'research')), false);
  assert.equal(existsSync(join(root, 'escape')), false);
  assert.deepEqual(artifactPaths(root), []);
});

test('a second file with the same name is saved beside the first, never over it', async () => {
  const root = tempRoot();
  failed(root, 'qwen2025');
  await withPage(root, async (url) => assert.equal((await drop(url, 'qwen2025', 'p.pdf', 'first')).status, 201));
  failed(root, 'qwen2025'); // the fetcher reopened it, e.g. the first file was the wrong paper
  await withPage(root, async (url) => assert.equal((await drop(url, 'qwen2025', 'p.pdf', 'second')).status, 201));
  const raw = join(root, 'research', 'refs', 'qwen2025', 'raw');
  assert.equal(readFileSync(join(raw, 'p.pdf'), 'utf8'), 'first');
  assert.equal(readFileSync(join(raw, 'p-1.pdf'), 'utf8'), 'second');
  assert.deepEqual(artifactPaths(root), ['research/refs/qwen2025/raw/p.pdf', 'research/refs/qwen2025/raw/p-1.pdf']);
});
