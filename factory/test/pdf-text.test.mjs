import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO, tempRoot } from './helpers.mjs';

const { parseArgs, txtPath, outputPaths, findPdftotext, GIT_PDFTOTEXT } = await import('../../scripts/pdf-text.mjs').catch(() => ({}));
const CLI = join(REPO, 'scripts', 'pdf-text.mjs');

test('arguments: PDFs, with an optional --out folder', () => {
  assert.deepEqual(parseArgs(['a.pdf', 'b.pdf']), { pdfs: ['a.pdf', 'b.pdf'], out: null });
  assert.deepEqual(parseArgs(['a.pdf', '--out', 'txt', 'b.pdf']), { pdfs: ['a.pdf', 'b.pdf'], out: 'txt' });
  assert.throws(() => parseArgs([]), /name at least one PDF/);
  assert.throws(() => parseArgs(['a.pdf', '--out']), /--out takes a folder/);
});

test('each PDF becomes <name>.txt beside it, or in --out', () => {
  assert.equal(txtPath(join('papers', 's1.pdf')), join('papers', 's1.txt'));
  assert.equal(txtPath(join('papers', 'S1.PDF'), 'txt'), join('txt', 'S1.txt'));
  assert.equal(txtPath('scan.bin', 'txt'), join('txt', 'scan.bin.txt'));
});

test('two PDFs that would write the same .txt are refused before any runs', () => {
  assert.deepEqual(outputPaths([join('a', 'x.pdf'), join('b', 'x.pdf')]), [join('a', 'x.txt'), join('b', 'x.txt')]);
  assert.throws(() => outputPaths([join('a', 'x.pdf'), join('b', 'x.pdf')], 'txt'), /both write .*x\.txt/);
});

test('pdftotext comes from PATH, else from Git for Windows, else nowhere', () => {
  assert.equal(findPdftotext({ runs: () => true, exists: () => true }), 'pdftotext');
  assert.equal(findPdftotext({ runs: () => false, exists: (p) => p === GIT_PDFTOTEXT }), GIT_PDFTOTEXT);
  assert.equal(findPdftotext({ runs: () => false, exists: () => false }), null);
});

test('the CLI names a missing PDF and exits 1, and a usage error exits 2', () => {
  const dir = tempRoot();
  const r = spawnSync(process.execPath, [CLI, join(dir, 'gone.pdf'), '--out', dir], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^fail\t.*gone\.pdf\tno such file/m);
  assert.equal(spawnSync(process.execPath, [CLI], { encoding: 'utf8' }).status, 2);
});

// A one-page PDF with one line of Helvetica text, with a correct xref table.
function tinyPdf(text) {
  const content = `BT /F1 18 Tf 20 40 Td (${text}) Tj ET`;
  const objs = [
    '<</Type/Catalog/Pages 2 0 R>>',
    '<</Type/Pages/Kids[3 0 R]/Count 1>>',
    '<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 100]/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>',
    '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>',
    `<</Length ${content.length}>>\nstream\n${content}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = objs.map((o, i) => {
    const at = pdf.length;
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
    return at;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<</Size ${objs.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF\n`;
  return pdf;
}

// The CI image (node:24.15.0) has no poppler, so this skip is on scripts/ci.mjs's allowed list.
test('the CLI turns real PDFs into text in one run', { skip: findPdftotext?.() ? false : 'pdftotext is not installed' }, () => {
  const dir = tempRoot();
  writeFileSync(join(dir, 'one.pdf'), tinyPdf('budget forcing'));
  writeFileSync(join(dir, 'two.pdf'), tinyPdf('test-time scaling'));
  const out = join(dir, 'txt');
  const r = spawnSync(process.execPath, [CLI, join(dir, 'one.pdf'), join(dir, 'two.pdf'), '--out', out], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.stdout.trim().split(/\r?\n/).filter((l) => l.startsWith('ok\t')).length, 2);
  assert.match(readFileSync(join(out, 'one.txt'), 'utf8'), /budget forcing/);
  assert.match(readFileSync(join(out, 'two.txt'), 'utf8'), /test-time scaling/);
  assert.equal(existsSync(join(dir, 'one.txt')), false);
});
