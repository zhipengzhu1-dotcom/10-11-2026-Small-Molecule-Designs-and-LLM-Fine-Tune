import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { REPO, tempRoot } from './helpers.mjs';

const SCRIPT = join(REPO, 'scripts', 'fetch-s1.mjs');
const sha = (buf) => createHash('sha256').update(buf).digest('hex');

// A minimal ustar archive, so the test controls every entry, including hostile ones.
function tar(entries) {
  const blocks = [];
  for (const { name, body = '', type = '0' } of entries) {
    const data = Buffer.from(body);
    const h = Buffer.alloc(512);
    h.write(name, 0, 100, 'utf8');
    h.write('0000644\0', 100);
    h.write('0000000\0', 108);
    h.write('0000000\0', 116);
    h.write(data.length.toString(8).padStart(11, '0') + '\0', 124);
    h.write('00000000000\0', 136);
    h.write('        ', 148);
    h.write(type, 156);
    h.write('ustar\0', 257);
    h.write('00', 263);
    let sum = 0;
    for (const b of h) sum += b;
    h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148);
    blocks.push(h, data, Buffer.alloc((512 - (data.length % 512)) % 512));
  }
  blocks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(blocks));
}

const PDF = Buffer.from('%PDF-1.5 fixture paper');
const HTML = Buffer.from('<html><article>fixture paper</article></html>');
const MAIN = '\\documentclass{article}\\begin{document}fixture\\end{document}\n';
const EPRINT = tar([
  { name: 'main.tex', body: MAIN },
  { name: 'figures/', type: '5' },
  { name: 'figures/plot.pdf', body: '%PDF plot' },
]);

// A repo root whose research/s1/raw/README.md records the hashes of the given files.
function rootWithReadme(files = { pdf: PDF, html: HTML, eprint: EPRINT, main: MAIN }) {
  const root = tempRoot();
  mkdirSync(join(root, 'research', 's1', 'raw'), { recursive: true });
  writeFileSync(join(root, 'research', 's1', 'raw', 'README.md'), [
    '# s1 primary sources', '', '```',
    `${sha(files.pdf)}  arxiv/2501.19393.pdf`,
    `${sha(files.html)}  arxiv/2501.19393.html`,
    `${sha(files.eprint)}  arxiv/e-print.tar.gz`,
    `${sha(files.main)}  arxiv/latex/main.tex`,
    '```', '',
  ].join('\n'));
  return root;
}

// Serves arXiv's three v3 URLs from memory and counts requests.
async function withArxiv(bodies, fn) {
  const routes = {
    '/pdf/2501.19393v3': bodies.pdf ?? PDF,
    '/html/2501.19393v3': bodies.html ?? HTML,
    '/e-print/2501.19393v3': bodies.eprint ?? EPRINT,
  };
  const hits = [];
  const server = createServer((req, res) => {
    hits.push(req.url);
    const body = routes[req.url];
    if (!body) { res.writeHead(404).end(); return; }
    res.writeHead(200).end(body);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    return await fn(`http://127.0.0.1:${server.address().port}`, hits);
  } finally {
    await new Promise((r) => server.close(r));
  }
}

// Runs the CLI the way `npm run fetch:s1` does, without blocking the in-process server.
function run(root, baseUrl) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [SCRIPT, '--root', root, '--base-url', baseUrl]);
    let stdout = '';
    let stderr = '';
    p.stdout.on('data', (d) => (stdout += d));
    p.stderr.on('data', (d) => (stderr += d));
    p.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

const arxiv = (root, ...p) => join(root, 'research', 's1', 'raw', 'arxiv', ...p);

test('a fresh checkout gets the PDF, the HTML and the extracted LaTeX, and keeps no tarball', async () => {
  const root = rootWithReadme();
  const r = await withArxiv({}, (url) => run(root, url));

  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(readFileSync(arxiv(root, '2501.19393.pdf')), PDF);
  assert.deepEqual(readFileSync(arxiv(root, '2501.19393.html')), HTML);
  assert.equal(readFileSync(arxiv(root, 'latex', 'main.tex'), 'utf8'), MAIN);
  assert.equal(readFileSync(arxiv(root, 'latex', 'figures', 'plot.pdf'), 'utf8'), '%PDF plot');
  assert.deepEqual(readdirSync(arxiv(root)).sort(), ['2501.19393.html', '2501.19393.pdf', 'latex']);
});

test('a download whose SHA-256 differs from README.md fails, names the file and is not kept', async () => {
  const root = rootWithReadme();
  const r = await withArxiv({ pdf: Buffer.from('%PDF-1.5 tampered') }, (url) => run(root, url));

  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /arxiv\/2501\.19393\.pdf/);
  assert.match(r.stderr, /SHA-256/);
  assert.equal(existsSync(arxiv(root, '2501.19393.pdf')), false);
});

for (const [what, entry] of [
  ['a path that climbs out of the folder', { name: `../fetch-s1-escape-${process.pid}.txt`, body: 'escaped' }],
  ['an absolute path', { name: `/tmp/fetch-s1-escape-${process.pid}.txt`, body: 'escaped' }],
  ['a symlink', { name: 'link.tex', type: '2' }],
]) {
  test(`an e-print holding ${what} is refused and no LaTeX is written`, async () => {
    const eprint = tar([{ name: 'main.tex', body: MAIN }, entry]);
    const root = rootWithReadme({ pdf: PDF, html: HTML, eprint, main: MAIN });
    const r = await withArxiv({ eprint }, (url) => run(root, url));

    assert.notEqual(r.status, 0);
    assert.match(r.stderr, new RegExp(entry.name.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')));
    assert.equal(existsSync(arxiv(root, 'latex')), false);
    assert.equal(existsSync(join(tmpdir(), `fetch-s1-escape-${process.pid}.txt`)), false);
  });
}

test('a second run finds every file already present and downloads nothing', async () => {
  const root = rootWithReadme();
  await withArxiv({}, (url) => run(root, url));

  const { r, hits } = await withArxiv({}, async (url, hits) => ({ r: await run(root, url), hits }));

  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(hits, []);
});

test('a file already present is checked against README.md, and a changed one fails without being replaced', async () => {
  const root = rootWithReadme();
  await withArxiv({}, (url) => run(root, url));
  writeFileSync(arxiv(root, '2501.19393.html'), 'edited by hand');

  const r = await withArxiv({}, (url) => run(root, url));

  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /arxiv\/2501\.19393\.html/);
  assert.equal(readFileSync(arxiv(root, '2501.19393.html'), 'utf8'), 'edited by hand');
});
