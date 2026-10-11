#!/usr/bin/env node
// Downloads s1's arXiv v3 PDF, HTML and LaTeX into research/s1/raw/arxiv/. These files are gitignored
// because arXiv's license does not allow republishing them.
//
//   node scripts/fetch-s1.mjs [--root <repo>] [--base-url <url>]
//
// Each download lands in a new empty folder first. The e-print tarball is unpacked by this script's own
// tar reader, so nothing in it runs.
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const ID = '2501.19393v3';

function args(argv) {
  const out = { root: dirname(dirname(fileURLToPath(import.meta.url))), baseUrl: 'https://arxiv.org' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--root') out.root = argv[++i];
    else if (argv[i] === '--base-url') out.baseUrl = argv[++i].replace(/\/$/, '');
    else throw new Error(`unknown argument: ${argv[i]}`);
  }
  return out;
}

async function download(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 s1-factory fetch-s1' } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// Writes the bytes into a new empty folder and returns that file's path.
function stage(bytes, name) {
  const dir = mkdtempSync(join(tmpdir(), 'fetch-s1-'));
  const file = join(dir, name);
  writeFileSync(file, bytes);
  return file;
}

// Reads a gzipped ustar archive into a folder. Only regular files and folders are written.
function untar(gz, dest) {
  const buf = gunzipSync(gz);
  for (let off = 0; off + 512 <= buf.length;) {
    const h = buf.subarray(off, off + 512);
    if (h.every((b) => b === 0)) break;
    const field = (start, len) => h.subarray(start, start + len).toString('utf8').replace(/\0.*$/s, '');
    const prefix = field(345, 155);
    const name = prefix ? `${prefix}/${field(0, 100)}` : field(0, 100);
    const size = parseInt(field(124, 12).trim() || '0', 8);
    const type = field(156, 1) || '0';
    const body = buf.subarray(off + 512, off + 512 + size);
    if (type !== '0' && type !== '5') throw new Error(`e-print entry ${name} has tar type ${type}; only files and folders are allowed`);
    const parts = name.split('/').filter(Boolean);
    if (name.startsWith('/') || /^[A-Za-z]:/.test(name) || name.includes('\\') || parts.includes('..')) {
      throw new Error(`e-print entry ${name} would land outside the LaTeX folder`);
    }
    const target = join(dest, ...parts);
    if (type === '5') mkdirSync(target, { recursive: true });
    else if (type === '0') {
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, body);
    }
    off += 512 + Math.ceil(size / 512) * 512;
  }
}

// The `hash  path` lines README.md records, keyed by path relative to research/s1/raw/.
function recordedHashes(raw) {
  const hashes = {};
  for (const m of readFileSync(join(raw, 'README.md'), 'utf8').matchAll(/^([0-9a-f]{64})\s+(\S+)/gm)) {
    hashes[m[2]] = m[1];
  }
  return hashes;
}

function check(hashes, path, bytes) {
  const want = hashes[path];
  if (!want) throw new Error(`README.md records no SHA-256 for ${path}`);
  const got = createHash('sha256').update(bytes).digest('hex');
  if (got !== want) throw new Error(`${path}: SHA-256 is ${got}, README.md records ${want}`);
}

// True when the file is already on disk with the recorded hash. Throws when it is there but differs,
// so a hand-edited or corrupted copy is reported instead of silently replaced.
function present(hashes, path, file) {
  if (!existsSync(file)) return false;
  check(hashes, path, readFileSync(file));
  console.log(`fetch-s1: ${path} already present, hash matches`);
  return true;
}

export async function fetchS1({ root, baseUrl }) {
  const raw = join(root, 'research', 's1', 'raw');
  const out = join(raw, 'arxiv');
  const hashes = recordedHashes(raw);
  mkdirSync(out, { recursive: true });

  for (const [kind, name] of [['pdf', '2501.19393.pdf'], ['html', '2501.19393.html']]) {
    if (present(hashes, `arxiv/${name}`, join(out, name))) continue;
    const bytes = await download(`${baseUrl}/${kind}/${ID}`);
    const staged = stage(bytes, name);
    try {
      check(hashes, `arxiv/${name}`, bytes);
      cpSync(staged, join(out, name));
      console.log(`fetch-s1: downloaded arxiv/${name}, hash matches`);
    } finally {
      rmSync(dirname(staged), { recursive: true, force: true });
    }
  }

  if (present(hashes, 'arxiv/latex/main.tex', join(out, 'latex', 'main.tex'))) return;
  const gz = await download(`${baseUrl}/e-print/${ID}`);
  const tarball = stage(gz, 'e-print.tar.gz');
  const unpacked = mkdtempSync(join(tmpdir(), 'fetch-s1-latex-'));
  try {
    check(hashes, 'arxiv/e-print.tar.gz', gz);
    untar(gz, unpacked);
    check(hashes, 'arxiv/latex/main.tex', readFileSync(join(unpacked, 'main.tex')));
    cpSync(unpacked, join(out, 'latex'), { recursive: true });
    console.log('fetch-s1: downloaded and unpacked arxiv/latex/, hashes match');
  } finally {
    rmSync(dirname(tarball), { recursive: true, force: true });
    rmSync(unpacked, { recursive: true, force: true });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  fetchS1(args(process.argv.slice(2))).catch((e) => {
    console.error(`fetch-s1: ${e.message}`);
    process.exit(1);
  });
}
