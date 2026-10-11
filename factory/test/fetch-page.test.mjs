import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { networkInterfaces } from 'node:os';
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

test('the page lists each open ref with its title, link and reason, and leaves out closed refs', async () => {
  const root = tempRoot();
  failed(root, 'qwen2025', ['title=Qwen2.5 Technical Report']); // title on the event
  failed(root, 'hendrycks2021'); // title only in the catalog
  failed(root, 'orphan2020'); // no title anywhere
  failed(root, 'done2023', ['title=Already Fetched']);
  write(['--root', root, '--run', 'run-1', '--agent', 'fetcher', 'artifact', 'path=research/refs/done2023/raw/d.pdf', 'kind=ref', 'ref=done2023']);
  failed(root, 'chrome2022', ['title=Fetched Later In Chrome']);
  write(['--root', root, '--run', 'run-1', '--agent', 'fetcher', 'artifact', 'path=research/refs/chrome2022/raw/c.pdf', 'kind=ref']); // no ref field
  mkdirSync(join(root, 'research', 'refs'), { recursive: true });
  writeFileSync(join(root, 'research', 'refs', 'catalog.tsv'),
    'bibkey\ttitle\tyear\tstatus\nhendrycks2021\tMeasuring Mathematical Problem Solving With the MATH Dataset\t2021\tfetch-pending\n');

  await withPage(root, async (url) => {
    const res = await fetch(`${url}/`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/html/);
    const html = await res.text();
    assert.match(html, /Qwen2\.5 Technical Report/);
    assert.match(html, /Measuring Mathematical Problem Solving With the MATH Dataset/);
    assert.match(html, /orphan2020/);
    for (const ref of ['qwen2025', 'hendrycks2021', 'orphan2020']) {
      assert.match(html, new RegExp(`href="https://example\\.org/${ref}\\.pdf"`));
    }
    assert.equal(html.match(/HTTP 403/g).length, 3);
    assert.doesNotMatch(html, /done2023|Already Fetched|chrome2022|Fetched Later/);
  });
});

test('the page works with no catalog and no events, and escapes untrusted titles and links', async () => {
  const empty = tempRoot();
  await withPage(empty, async (url) => {
    const res = await fetch(`${url}/`);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /Nothing to fetch/);
  });

  const root = tempRoot();
  const r = write(['--root', root, '--run', 'run-1', '--agent', 'fetcher', 'fetch.failed',
    'ref=evil2024', 'url=javascript:alert(1)', 'reason=<img src=x onerror=alert(1)>', 'title=<script>alert(1)</script>']);
  assert.equal(r.status, 0, r.stderr);
  await withPage(root, async (url) => {
    const html = await (await fetch(`${url}/`)).text();
    assert.doesNotMatch(html, /<script>alert|<img src=x|href="javascript:/);
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  });
});

const artifactPaths = (root) => readStream(root).filter((e) => e.type === 'artifact').map((e) => e.path);

const lanAddress = () =>
  Object.values(networkInterfaces()).flat().find((i) => i && i.family === 'IPv4' && !i.internal)?.address;

test('the page cannot be reached from another machine\'s address', { skip: !lanAddress() && 'no non-loopback IPv4 interface' }, async () => {
  const root = tempRoot();
  await withPage(root, async (url) => {
    const port = new URL(url).port;
    await assert.rejects(fetch(`http://${lanAddress()}:${port}/`, { signal: AbortSignal.timeout(3000) }));
  });
});

// Raw HTTP so the Host and Origin headers are exactly what a hostile page would send.
function rawRequest(url, { method = 'GET', path = '/', headers = {}, body = '' }) {
  const u = new URL(url);
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port: u.port, method, path, headers }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', reject);
    req.end(body);
  });
}

test('a request naming another host (DNS rebinding) or a drop from another site is refused', async () => {
  const root = tempRoot();
  failed(root, 'qwen2025');
  await withPage(root, async (url) => {
    const port = new URL(url).port;
    assert.equal(await rawRequest(url, { headers: { host: `evil.example:${port}` } }), 403);
    assert.equal(await rawRequest(url, { headers: { host: `localhost:${port}` } }), 200);
    const path = '/drop?ref=qwen2025&name=x.pdf';
    for (const origin of ['https://evil.example', 'null', `http://127.0.0.1:${Number(port) + 1}`]) {
      assert.equal(await rawRequest(url, { method: 'POST', path, headers: { origin }, body: 'data' }), 403, origin);
    }
    assert.equal(await rawRequest(url, { method: 'POST', path, headers: { origin: url }, body: 'data' }), 201);
  });
  assert.deepEqual(artifactPaths(root), ['research/refs/qwen2025/raw/x.pdf']);
});

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
