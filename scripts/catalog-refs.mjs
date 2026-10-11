#!/usr/bin/env node
// Builds research/refs/catalog.tsv: one row per key s1's main.tex cites (\cite-family or \nocite),
// with title, year, link, why s1 cites it, a Tier 1 flag and an open-access status.
//
//   node scripts/catalog-refs.mjs --latex <dir with main.tex and reference.bib>
//        [--root <repo>] [--cache <lookups.json>] [--download]
//
// Open-access status, in order: an arXiv ID in the bib entry; then OpenAlex (an arXiv location, else
// best_oa_location); then Semantic Scholar (externalIds.ArXiv, else openAccessPdf); then the bib
// entry's own URL when it is a public web page rather than a publisher's paper. Nothing found: closed.
// The tier1 flag and why come from research/refs/curation.tsv, written by hand.
//
// --download fetches each Tier 1 reference that has an open copy into research/refs/<key>/raw/, a new
// empty folder, and records its SHA-256 and license. Files are untrusted data: they are hashed and
// saved, never opened or run. Closed references get no attempt. Failures are printed so the caller can
// log fetch.failed events; their rows get status fetch-pending.
//
// Requests go to arXiv, OpenAlex and Semantic Scholar spaced out per host and retried with backoff.
// No email address, API key or other identifier is sent. Results are cached in --cache (default: the
// OS temp dir) so a rerun makes no new requests.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { citedKeys, readCatalog } from '../factory/checks/references.mjs';

const COLUMNS = ['key', 'title', 'year', 'link', 'why', 'tier1', 'status', 'oa_source', 'oa_url', 'license', 'file', 'sha256', 'note'];
// Licenses that allow anyone to redistribute the file, so it may be committed to this public repo.
const REDISTRIBUTABLE = /^(CC BY( |-SA )\d|CC0|public domain)/i;

function args(argv) {
  const out = { root: dirname(dirname(fileURLToPath(import.meta.url))), cache: join(tmpdir(), 's1-catalog-refs', 'lookups.json'), download: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--download') out.download = true;
    else if (['--root', '--cache', '--latex'].includes(a) && i + 1 < argv.length) out[a.slice(2)] = argv[++i];
    else throw new Error(`unknown argument: ${a}`);
  }
  if (!out.latex) throw new Error('--latex <dir> is required (the gitignored LaTeX lives in the main checkout)');
  return out;
}

// ---------- BibTeX ----------

// Returns { key: { type, fields } } for every entry. Values in {...} or "..." with nested braces.
export function parseBib(text) {
  const entries = {};
  const re = /@(\w+)\s*\{\s*([^,\s]+)\s*,/g;
  let m;
  while ((m = re.exec(text))) {
    let i = re.lastIndex;
    const fields = {};
    for (;;) {
      const fm = /\s*,?\s*([A-Za-z_-]+)\s*=\s*/y;
      fm.lastIndex = i;
      const f = fm.exec(text);
      if (!f) break;
      i = fm.lastIndex;
      let value;
      if (text[i] === '{' || text[i] === '"') {
        const close = text[i] === '{' ? '}' : '"';
        let depth = 0;
        let j = i;
        for (; j < text.length; j++) {
          const c = text[j];
          if (c === '{' && !(close === '"' && j === i)) depth++;
          else if (c === '}' && close === '}') { depth--; if (depth === 0) break; }
          else if (c === '}') depth--;
          else if (c === '"' && close === '"' && j > i && depth === 0) break;
        }
        value = text.slice(i + 1, j);
        i = j + 1;
      } else {
        const bare = /[^,}\s]+/y;
        bare.lastIndex = i;
        value = bare.exec(text)?.[0] ?? '';
        i = bare.lastIndex;
      }
      fields[f[1].toLowerCase()] = value.replace(/\s+/g, ' ').trim();
    }
    entries[m[2]] = { type: m[1].toLowerCase(), fields };
    re.lastIndex = i;
  }
  return entries;
}

export function cleanTex(s = '') {
  return s.replace(/\\(?:textbf|textit|emph|textsc|url)\{([^}]*)\}/g, '$1')
    .replace(/\\([&%$#_])/g, '$1').replace(/~/g, ' ').replace(/[{}]/g, '')
    .replace(/\\'([a-z])/gi, '$1').replace(/\\"([a-z])/gi, '$1').replace(/\s+/g, ' ').trim();
}

const ARXIV_ID = /(\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?\/\d{7})(?:v\d+)?/i;

export function arxivId(fields) {
  const { eprint, archiveprefix, url, journal, doi, howpublished, note, booktitle } = fields;
  if (eprint && (!archiveprefix || /arxiv/i.test(archiveprefix))) {
    const m = new RegExp(`^${ARXIV_ID.source}$`, 'i').exec(eprint.trim());
    if (m) return m[1];
  }
  for (const s of [url, howpublished, note]) {
    const m = s && new RegExp(`arxiv\\.org/(?:abs|pdf)/${ARXIV_ID.source}`, 'i').exec(s);
    if (m) return m[1];
  }
  for (const s of [journal, booktitle, note]) {
    const m = s && new RegExp(`arxiv[:\\s]*(?:preprint)?[:\\s]*(?:arxiv:)?\\s*${ARXIV_ID.source}`, 'i').exec(s);
    if (m) return m[1];
  }
  const d = doi && /10\.48550\/arxiv\.(.+)$/i.exec(doi);
  return d ? d[1] : null;
}

function bibUrl(fields) {
  for (const s of [fields.url, fields.howpublished, fields.note]) {
    const m = s && /https?:\/\/[^\s}]+/.exec(s);
    if (m) return m[0];
  }
  return null;
}

// ---------- HTTP: spaced, retried, anonymous ----------

const SPACING = { 'arxiv.org': 3500, 'export.arxiv.org': 3500, 'api.openalex.org': 1200, 'api.semanticscholar.org': 4000 };
const lastHit = new Map();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function request(url, { tries = 6 } = {}) {
  const host = new URL(url).host;
  let lastErr;
  for (let attempt = 0; attempt < tries; attempt++) {
    const wait = (lastHit.get(host) ?? 0) + (SPACING[host] ?? 2000) - Date.now();
    if (wait > 0) await sleep(wait);
    lastHit.set(host, Date.now());
    try {
      const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(60000) });
      if (res.status === 429 || res.status >= 500) {
        const after = Number(res.headers.get('retry-after'));
        lastErr = new Error(`HTTP ${res.status}`);
        await sleep(Number.isFinite(after) && after > 0 ? after * 1000 : 2000 * 2 ** attempt);
        continue;
      }
      return res;
    } catch (err) {
      lastErr = err;
      await sleep(2000 * 2 ** attempt);
    }
  }
  throw new Error(`${url}: ${lastErr?.message ?? 'failed'} after ${tries} tries`);
}

async function getJson(url) {
  const res = await request(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

// ---------- Lookups ----------

const norm = (s = '') => s.toLowerCase().replace(/<[^>]+>/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

// Dice coefficient on word bigrams of normalized titles; 1 means identical.
function similarity(a, b) {
  const grams = (s) => { const w = norm(s).split(' '); return w.length < 2 ? w : w.slice(1).map((x, i) => `${w[i]} ${x}`); };
  const ga = grams(a);
  const gb = grams(b);
  if (!ga.length || !gb.length) return 0;
  const pool = [...gb];
  let hit = 0;
  for (const g of ga) { const k = pool.indexOf(g); if (k >= 0) { hit++; pool.splice(k, 1); } }
  return (2 * hit) / (ga.length + gb.length);
}
const MATCH = 0.85;

// A title search is trusted only for a title of 3+ words whose hit is within a year of the bib's year:
// a one-word title such as "AIME" otherwise matches an unrelated paper of the same name.
const searchable = (title) => norm(title).split(' ').length >= 3;
const sameYear = (year, hitYear) => !year || !hitYear || Math.abs(Number(year) - Number(hitYear)) <= 1;

function arxivFromUrl(u) {
  const m = u && new RegExp(`arxiv\\.org/(?:abs|pdf)/${ARXIV_ID.source}`, 'i').exec(u);
  return m ? m[1] : null;
}

async function openAlex(title, doi, year) {
  const select = 'select=id,display_name,publication_year,doi,best_oa_location,locations';
  let work = null;
  if (doi) work = await getJson(`https://api.openalex.org/works/https://doi.org/${encodeURIComponent(doi)}?${select}`);
  if (!work && searchable(title)) {
    const q = norm(title).slice(0, 200);
    const data = await getJson(`https://api.openalex.org/works?search=${encodeURIComponent(q)}&per-page=5&${select}`);
    work = (data?.results ?? []).map((w) => ({ w, s: similarity(title, w.display_name) }))
      .filter((x) => x.s >= MATCH && sameYear(year, x.w.publication_year)).sort((x, y) => y.s - x.s)[0]?.w ?? null;
  }
  if (!work) return { found: false, ...(doi || searchable(title) ? {} : { skipped: 'title too short to search reliably' }) };
  const arxiv = (work.locations ?? []).map((l) => arxivFromUrl(l.landing_page_url) || arxivFromUrl(l.pdf_url)).find(Boolean);
  const best = work.best_oa_location;
  return {
    found: true, id: work.id, title: work.display_name, year: work.publication_year, doi: work.doi, arxiv: arxiv ?? null,
    oaUrl: best ? best.pdf_url || best.landing_page_url : null, license: best?.license ?? null,
  };
}

async function semanticScholar(title, doi, year) {
  const fields = 'fields=title,year,externalIds,openAccessPdf';
  let paper = null;
  if (doi) paper = await getJson(`https://api.semanticscholar.org/graph/v1/paper/DOI:${encodeURIComponent(doi)}?${fields}`);
  if (!paper && searchable(title)) {
    const data = await getJson(`https://api.semanticscholar.org/graph/v1/paper/search/match?query=${encodeURIComponent(norm(title).slice(0, 200))}&${fields}`);
    const p = data?.data?.[0];
    if (p && similarity(title, p.title) >= MATCH && sameYear(year, p.year)) paper = p;
  }
  if (!paper) return { found: false, ...(doi || searchable(title) ? {} : { skipped: 'title too short to search reliably' }) };
  return {
    found: true, id: paper.paperId, title: paper.title, year: paper.year,
    arxiv: paper.externalIds?.ArXiv ?? null, oaUrl: paper.openAccessPdf?.url || null,
  };
}

// Hosts that serve paywalled publisher copies; a bib URL there is not an open copy.
const PAYWALLED = /(^|\.)(doi\.org|ieeexplore\.ieee\.org|sciencedirect\.com|link\.springer\.com|dl\.acm\.org|tandfonline\.com|wiley\.com|jstor\.org)$/i;

async function lookup(key, entry, cache) {
  if (cache[key]?.lookup) return cache[key].lookup;
  const f = entry.fields;
  const title = cleanTex(f.title);
  const doi = f.doi && !/10\.48550\/arxiv/i.test(f.doi) ? f.doi : null;
  const out = { title, year: f.year ?? '', arxiv: arxivId(f), doi, bibUrl: bibUrl(f), source: 'none', oaUrl: '', license: '', apis: [] };
  if (out.arxiv) out.source = 'arxiv-id';
  else {
    const oa = await openAlex(title, doi, f.year).catch((e) => ({ error: e.message }));
    out.apis.push({ api: 'openalex', ...oa });
    if (oa.arxiv) Object.assign(out, { arxiv: oa.arxiv, source: 'openalex' });
    else if (oa.oaUrl) Object.assign(out, { source: 'openalex', oaUrl: oa.oaUrl, license: oa.license ?? '' });
    else {
      const s2 = await semanticScholar(title, doi, f.year).catch((e) => ({ error: e.message }));
      out.apis.push({ api: 'semantic-scholar', ...s2 });
      if (s2.arxiv) Object.assign(out, { arxiv: s2.arxiv, source: 'semantic-scholar' });
      else if (s2.oaUrl) Object.assign(out, { source: 'semantic-scholar', oaUrl: s2.oaUrl });
      else if (out.bibUrl && !PAYWALLED.test(new URL(out.bibUrl).hostname)) Object.assign(out, { source: 'bib-url', oaUrl: out.bibUrl });
    }
  }
  cache[key] = { ...cache[key], lookup: out };
  return out;
}

// ---------- Tier 1 downloads ----------

const LICENSES = [
  [/creativecommons\.org\/licenses\/by\/(\d\.\d)/i, 'CC BY $1'],
  [/creativecommons\.org\/licenses\/by-sa\/(\d\.\d)/i, 'CC BY-SA $1'],
  [/creativecommons\.org\/licenses\/by-nc-sa\/(\d\.\d)/i, 'CC BY-NC-SA $1'],
  [/creativecommons\.org\/licenses\/by-nc-nd\/(\d\.\d)/i, 'CC BY-NC-ND $1'],
  [/creativecommons\.org\/licenses\/by-nc\/(\d\.\d)/i, 'CC BY-NC $1'],
  [/creativecommons\.org\/licenses\/by-nd\/(\d\.\d)/i, 'CC BY-ND $1'],
  [/creativecommons\.org\/publicdomain\/zero/i, 'CC0 1.0'],
  [/arxiv\.org\/licenses\/nonexclusive-distrib\/1\.0/i, 'arXiv nonexclusive-distrib 1.0'],
];

// arXiv's abstract page links the paper's license as "Rights to this article"; the default is
// arXiv's nonexclusive distribution license, which does not let others redistribute.
async function arxivLicense(id) {
  const res = await request(`https://arxiv.org/abs/${id}`);
  if (!res.ok) return `unknown (abs page HTTP ${res.status})`;
  const html = await res.text();
  const block = /Rights to this article[\s\S]{0,400}?href="([^"]+)"|href="([^"]+)"[^>]*title="Rights to this article"/i.exec(html);
  const href = block?.[1] || block?.[2] || '';
  for (const [re, name] of LICENSES) {
    const m = re.exec(href);
    if (m) return name.replace('$1', m[1] ?? '');
  }
  return href ? `unknown (${href})` : 'unknown (no license link on abs page)';
}

function prettyLicense(raw) {
  if (!raw) return 'unknown';
  const m = /^cc-(by(?:-[a-z-]+)?)$/i.exec(raw);
  if (m) return `CC ${m[1].toUpperCase()}`;
  if (/^cc0$/i.test(raw)) return 'CC0';
  if (/public-domain/i.test(raw)) return 'public domain';
  return raw;
}

function emptyRaw(root, key) {
  const dir = join(root, 'research', 'refs', key, 'raw');
  if (existsSync(dir) && readdirSync(dir).length) return { dir, existing: readdirSync(dir) };
  mkdirSync(dir, { recursive: true });
  return { dir, existing: [] };
}

// A GitHub "blob" link serves an HTML viewer; the file itself is on raw.githubusercontent.com.
function directUrl(url) {
  const m = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)$/.exec(url);
  return m ? `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}` : url;
}

async function licenseOf(look) {
  if (look.arxiv) return arxivLicense(look.arxiv);
  return prettyLicense(look.license) + (look.source === 'bib-url' ? ' (web page; no license found by the APIs)' : '');
}

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

// expected: the SHA-256 an earlier run recorded in catalog.tsv. A gitignored file is re-fetched in
// each checkout, and must come back byte for byte.
async function download(root, key, look, expected) {
  const url = look.arxiv ? `https://arxiv.org/pdf/${look.arxiv}` : directUrl(look.oaUrl);
  const { dir, existing } = emptyRaw(root, key);
  if (existing.length) {
    // Fetched on an earlier run or dropped on the fetch page: hash what is there.
    const name = existing[0];
    const hash = sha256(readFileSync(join(dir, name)));
    if (expected && hash !== expected) return { ok: false, url, reason: `${name} SHA-256 ${hash} differs from catalog ${expected}` };
    return { ok: true, name, url, sha256: hash, license: await licenseOf(look) };
  }
  let res;
  try {
    res = await request(url, { tries: 4 });
  } catch (err) {
    return { ok: false, url, reason: err.message };
  }
  if (!res.ok) return { ok: false, url, reason: `HTTP ${res.status}` };
  const bytes = Buffer.from(await res.arrayBuffer());
  const type = (res.headers.get('content-type') || '').split(';')[0].trim();
  const isPdf = bytes.subarray(0, 5).toString('latin1') === '%PDF-';
  const wantPdf = Boolean(look.arxiv) || /\.pdf($|\?)/i.test(url);
  if (wantPdf && !isPdf) return { ok: false, url, reason: `expected a PDF, got ${type || 'unknown type'} (${bytes.length} bytes)` };
  if (!isPdf && !/html|text\/plain/.test(type)) return { ok: false, url, reason: `unexpected content type ${type}` };
  const hash = sha256(bytes);
  if (expected && hash !== expected) return { ok: false, url, reason: `download SHA-256 ${hash} differs from catalog ${expected}` };
  const name = look.arxiv ? `${look.arxiv.replace('/', '_')}.pdf` : isPdf ? 'paper.pdf' : 'page.html';
  writeFileSync(join(dir, name), bytes, { flag: 'wx' });
  return { ok: true, name, url, sha256: hash, license: await licenseOf(look) };
}

// ---------- Catalog ----------

function link(look) {
  if (look.arxiv) return `https://arxiv.org/abs/${look.arxiv}`;
  if (look.doi) return `https://doi.org/${look.doi}`;
  return look.bibUrl || look.oaUrl || '';
}

function note(look) {
  const notes = [];
  const missed = look.apis.filter((a) => !a.found)
    .map((a) => (a.error ? `${a.api} error: ${a.error}` : a.skipped ? `${a.api} not searched: ${a.skipped}` : `not found in ${a.api}`));
  if (look.source === 'bib-url') notes.push(`open web page from the bib entry; ${missed.join('; ') || 'no API match'}`);
  else if (look.source === 'none') notes.push(missed.length ? missed.join('; ') : 'APIs found the work but no open copy');
  for (const a of look.apis) if (a.found && !a.arxiv && !a.oaUrl && look.source === 'none') notes.push(`${a.api} has it with no open copy`);
  return notes.join('; ');
}

const tsvCell = (s) => String(s ?? '').replace(/[\t\r\n]+/g, ' ').trim();

async function main() {
  const opts = args(process.argv.slice(2));
  const keys = citedKeys(readFileSync(join(opts.latex, 'main.tex'), 'utf8'));
  const bib = parseBib(readFileSync(join(opts.latex, 'reference.bib'), 'utf8'));
  const curation = new Map(readCatalog(readFileSync(join(opts.root, 'research', 'refs', 'curation.tsv'), 'utf8')).map((r) => [r.key, r]));
  const cache = existsSync(opts.cache) ? JSON.parse(readFileSync(opts.cache, 'utf8')) : {};
  const catalogPath = join(opts.root, 'research', 'refs', 'catalog.tsv');
  const prior = new Map(existsSync(catalogPath) ? readCatalog(readFileSync(catalogPath, 'utf8')).map((r) => [r.key, r]) : []);
  const save = () => { mkdirSync(dirname(opts.cache), { recursive: true }); writeFileSync(opts.cache, JSON.stringify(cache, null, 2)); };

  const rows = [];
  const failures = [];
  for (const key of keys) {
    const entry = bib[key];
    const cur = curation.get(key);
    if (!cur) throw new Error(`curation.tsv has no row for cited key ${key}`);
    if (!entry) {
      rows.push({ key, title: '', year: '', link: '', why: cur.why, tier1: cur.tier1, status: 'closed', oa_source: 'none', note: 'key missing from reference.bib' });
      continue;
    }
    const look = await lookup(key, entry, cache);
    save();
    process.stderr.write(`${key}: ${look.source}\n`);
    const row = {
      key, title: look.title, year: look.year, link: link(look), why: cur.why, tier1: cur.tier1,
      status: look.arxiv ? 'arxiv' : look.source === 'none' ? 'closed' : 'oa',
      oa_source: look.source, oa_url: look.arxiv ? `https://arxiv.org/pdf/${look.arxiv}` : look.oaUrl,
      license: '', file: '', sha256: '', note: note(look),
    };
    const before = prior.get(key);
    if (cur.tier1 === 'yes' && row.status !== 'closed') {
      let dl = cache[key]?.download;
      if (opts.download && !dl?.ok) {
        dl = await download(opts.root, key, look, before?.sha256 || null);
        cache[key].download = dl;
        save();
      }
      if (!dl && ['fetched', 'fetch-pending'].includes(before?.status)) {
        // No download this run: keep what the last run recorded.
        for (const c of ['status', 'oa_url', 'license', 'file', 'sha256', 'note']) row[c] = before[c];
      } else if (dl?.ok) {
        Object.assign(row, { status: 'fetched', oa_url: dl.url, license: dl.license, file: `research/refs/${key}/raw/${dl.name}`, sha256: dl.sha256 });
        row.note = [row.note, REDISTRIBUTABLE.test(dl.license) ? 'file committed' : 'file gitignored: only CC BY, CC BY-SA or CC0 files are committed'].filter(Boolean).join('; ');
      } else if (dl) {
        row.status = 'fetch-pending';
        row.note = [row.note, `download failed: ${dl.reason}`].filter(Boolean).join('; ');
        failures.push({ key, url: dl.url, reason: dl.reason, title: look.title });
      }
    }
    rows.push(row);
  }

  const out = [COLUMNS.join('\t'), ...rows.map((r) => COLUMNS.map((c) => tsvCell(r[c])).join('\t'))].join('\n') + '\n';
  writeFileSync(catalogPath, out);
  const count = (s) => rows.filter((r) => r.status === s).length;
  process.stdout.write(`catalog: ${rows.length} refs (${['arxiv', 'oa', 'closed', 'fetch-pending', 'fetched'].map((s) => `${s} ${count(s)}`).join(', ')})\n`);
  for (const r of rows.filter((x) => x.tier1 === 'yes')) process.stdout.write(`tier1 ${r.key}\t${r.status}\t${r.license}\t${r.file}\n`);
  for (const f of failures) process.stdout.write(`FAILED\t${f.key}\t${f.url}\t${f.reason}\t${f.title}\n`);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => { process.stderr.write(`catalog-refs: ${err.message}\n`); process.exit(1); });
}
