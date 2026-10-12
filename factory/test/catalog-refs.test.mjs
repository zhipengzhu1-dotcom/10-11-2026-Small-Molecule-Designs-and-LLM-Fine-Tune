import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO, tempRoot } from './helpers.mjs';

const SCRIPT = join(REPO, 'scripts', 'catalog-refs.mjs');

// Stands in for arXiv and the web hosts a bib entry links to. Records every path requested.
async function fakeWeb() {
  const files = {
    '/pdf/2401.00001': '%PDF-1.5 paper A',
    '/abs/2401.00001': '<a href="http://arxiv.org/licenses/nonexclusive-distrib/1.0/" title="Rights to this article">license</a>',
    '/report.pdf': '%PDF-1.4 numina report',
    '/thinking': '<html>a different page now</html>',
  };
  const hits = [];
  const server = createServer((req, res) => {
    hits.push(req.url);
    const body = files[req.url];
    if (body === undefined) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'content-type': req.url.endsWith('.pdf') || req.url.startsWith('/pdf/') ? 'application/pdf' : 'text/html' }).end(body);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, files, hits, close: () => new Promise((r) => server.close(r)) };
}

// A repo with a two-key-type bibliography: arXiv papers and web pages with one-word titles (so no
// OpenAlex or Semantic Scholar request is made). heldC's curation says the cited page has changed.
const HELD = 'cited page changed: the URL now serves a different page';

// curation.tsv overrides a catalog column whenever it names that column and fills the cell.
function repo(base, held = {}) {
  const heldCols = ['status', 'oa_source', 'oa_url', 'file', 'sha256', 'note'];
  const root = tempRoot();
  const latex = join(root, 'latex');
  mkdirSync(latex);
  mkdirSync(join(root, 'research', 'refs'), { recursive: true });
  writeFileSync(join(latex, 'main.tex'), 'A \\citep{paperA,webB} B \\cite{heldC} C \\citet{otherD}.\n');
  writeFileSync(join(latex, 'reference.bib'), [
    '@misc{paperA, title={Paper A Is About Reasoning}, year={2024}, eprint={2401.00001}, archivePrefix={arXiv}}',
    `@misc{webB, title={Numina}, year={2024}, url={${base}/report.pdf}}`,
    `@misc{heldC, title={Thinking}, year={2024}, url={${base}/thinking}}`,
    '@misc{otherD, title={Other Paper D Is Background}, year={2023}, eprint={2301.00002}, archivePrefix={arXiv}}',
  ].join('\n'));
  const blanks = '\t'.repeat(heldCols.length);
  writeFileSync(join(root, 'research', 'refs', 'curation.tsv'), [
    ['key\ttier1\twhy\tlicense\thold', ...heldCols].join('\t'),
    `paperA\tyes\tbase model\t\t${blanks}`,
    `webB\tyes\tdata source\tApache-2.0 (repo license)\t${blanks}`,
    ['heldC\tyes\ttrace generator\t\t' + HELD, ...heldCols.map((c) => held[c] ?? '')].join('\t'),
    `otherD\tno\tbackground\t\t${blanks}`,
  ].join('\n') + '\n');
  return { root, latex };
}

function run({ root, latex }, base, extra = []) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [SCRIPT, '--root', root, '--latex', latex, '--cache', join(tempRoot(), 'cache.json'),
      '--arxiv-base', base, ...extra]);
    let stdout = '';
    let stderr = '';
    p.stdout.on('data', (d) => (stdout += d));
    p.stderr.on('data', (d) => (stderr += d));
    p.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

const catalogOf = (root) => readFileSync(join(root, 'research', 'refs', 'catalog.tsv'), 'utf8');
const rowOf = (root, key) => {
  const [header, ...rows] = catalogOf(root).trim().split('\n').map((l) => l.split('\t'));
  const r = rows.find((x) => x[0] === key);
  return Object.fromEntries(header.map((h, i) => [h, r[i]]));
};

test('a second run with --download leaves the catalog byte for byte the same and requests nothing', async () => {
  const web = await fakeWeb();
  try {
    const r = repo(web.base);
    const first = await run(r, web.base, ['--download']);
    assert.equal(first.status, 0, first.stderr);
    assert.equal(rowOf(r.root, 'paperA').status, 'fetched');
    assert.equal(rowOf(r.root, 'webB').license, 'Apache-2.0 (repo license)');
    const before = catalogOf(r.root);
    web.hits.length = 0;

    const second = await run(r, web.base, ['--download']);
    assert.equal(second.status, 0, second.stderr);
    assert.equal(catalogOf(r.root), before);
    assert.deepEqual(web.hits, []);
  } finally {
    await web.close();
  }
});

test('hand edits to a catalog row survive a rerun', async () => {
  const web = await fakeWeb();
  try {
    const r = repo(web.base);
    await run(r, web.base, ['--download']);
    const path = join(r.root, 'research', 'refs', 'catalog.tsv');
    writeFileSync(path, catalogOf(r.root).replace(/(\nwebB\t.*\t)([^\t\n]*)\n/, '$1checked by hand\n'));
    const edited = catalogOf(r.root);

    await run(r, web.base, ['--download']);
    assert.equal(catalogOf(r.root), edited);
    assert.equal(rowOf(r.root, 'webB').note, 'checked by hand');
  } finally {
    await web.close();
  }
});

test('a ref whose curation says the cited page changed is never fetched and stays fetch-pending', async () => {
  const web = await fakeWeb();
  try {
    const r = repo(web.base);
    await run(r, web.base, ['--download']);
    await run(r, web.base, ['--download']);
    assert.ok(!web.hits.includes('/thinking'), `requested: ${web.hits.join(', ')}`);
    const row = rowOf(r.root, 'heldC');
    assert.equal(row.status, 'fetch-pending');
    assert.match(row.note, /cited page changed/);
    assert.ok(!existsSync(join(r.root, 'research', 'refs', 'heldC', 'raw', 'page.html')));
  } finally {
    await web.close();
  }
});

test('a missing ignored file is restored only when its SHA-256 matches the catalog', async () => {
  const web = await fakeWeb();
  try {
    const r = repo(web.base);
    await run(r, web.base, ['--download']);
    const before = catalogOf(r.root);
    const file = join(r.root, rowOf(r.root, 'paperA').file);

    rmSync(file);
    await run(r, web.base, ['--download']);
    assert.equal(readFileSync(file, 'utf8'), '%PDF-1.5 paper A');
    assert.equal(catalogOf(r.root), before);

    rmSync(file);
    web.files['/pdf/2401.00001'] = '%PDF-1.5 a newer version';
    const changed = await run(r, web.base, ['--download']);
    assert.ok(!existsSync(file), 'a file with a different SHA-256 must not be saved');
    assert.equal(catalogOf(r.root), before);
    assert.match(changed.stdout, /FAILED\tpaperA\t.*SHA-256/);
  } finally {
    await web.close();
  }
});

test('a cited key missing from reference.bib fails the run by name and writes no catalog', async () => {
  const web = await fakeWeb();
  try {
    const r = repo(web.base);
    writeFileSync(join(r.latex, 'main.tex'), 'A \\citep{paperA,webB} B \\cite{heldC} C \\citet{otherD} \\cite{ghostE}.\n');
    const curation = join(r.root, 'research', 'refs', 'curation.tsv');
    writeFileSync(curation, readFileSync(curation, 'utf8') + `ghostE\tno\tbackground\t\t${'\t'.repeat(6)}\n`);

    const out = await run(r, web.base);
    assert.notEqual(out.status, 0);
    assert.match(out.stderr, /ghostE/);
    assert.match(out.stderr, /reference\.bib/);
    assert.ok(!existsSync(join(r.root, 'research', 'refs', 'catalog.tsv')), 'no catalog may be written');
  } finally {
    await web.close();
  }
});

test('a ref fetched by hand and recorded in curation.tsv shows as fetched and is never downloaded', async () => {
  const web = await fakeWeb();
  try {
    const held = {
      status: 'fetched', oa_source: 'wayback (saved by hand)', oa_url: `${web.base}/wayback/thinking`,
      file: 'research/refs/heldC/raw/snapshot.html', sha256: 'a'.repeat(64), note: 'Dec 2024 snapshot, saved from Chrome',
    };
    const r = repo(web.base, held);
    // The file lives only in the main checkout, so it is absent here.
    const first = await run(r, web.base, ['--download']);
    assert.equal(first.status, 0, first.stderr);
    const before = catalogOf(r.root);
    await run(r, web.base, ['--download']);

    assert.equal(catalogOf(r.root), before);
    assert.ok(!web.hits.some((h) => h.includes('thinking')), `requested: ${web.hits.join(', ')}`);
    const row = rowOf(r.root, 'heldC');
    for (const [c, v] of Object.entries(held)) assert.equal(row[c], v, c);
    assert.ok(!existsSync(join(r.root, 'research', 'refs', 'heldC', 'raw')), 'nothing may be written for a held ref');
  } finally {
    await web.close();
  }
});
