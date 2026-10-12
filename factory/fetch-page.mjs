#!/usr/bin/env node
// Fetch page. Lists every open fetch.failed ref and saves a dropped file into that ref's
// raw folder, research/refs/<ref>/raw/, then writes an artifact event for it.
//
//   node factory/fetch-page.mjs [--root <repo>] [--port 4174]
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cli, UsageError } from './cli.mjs';
import { defaultRoot, writeEvent } from './log.mjs';
import { readStream } from './read.mjs';

export const AGENT = 'fetch-page';

// A fetch.failed event is open until an artifact event for the same ref follows it: one with
// a matching ref field, or a path inside research/refs/<ref>/raw/.
export function openFailures(root) {
  const open = new Map();
  for (const e of readStream(root)) {
    if (e.type === 'fetch.failed') open.set(e.ref, e);
    else if (e.type === 'artifact') {
      if (e.ref) open.delete(e.ref);
      const m = /^research\/refs\/([^/]+)\/raw\//.exec(String(e.path).replace(/\\/g, '/'));
      if (m) open.delete(m[1]);
    }
  }
  return open;
}

// The ref becomes a folder name, so it must be one on every OS: no separators, no ':', no '..'.
const SAFE_REF = /^[A-Za-z0-9][A-Za-z0-9._+-]*$/;

// Reduces whatever name the browser sent to a plain file name: last path segment only, no
// leading or trailing dots, a safe character set, never a Windows device name.
export function safeName(raw) {
  let name = String(raw ?? '').split(/[\\/]/).pop();
  name = name.replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\.+|\.+$/g, '').slice(0, 150);
  if (/^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(name)) name = `_${name}`;
  return name || 'file';
}

// Writes without ever replacing a file: p.pdf, then p-1.pdf, p-2.pdf, ...
function saveNew(dir, name, body) {
  const dot = name.lastIndexOf('.');
  const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
  for (let i = 0; ; i++) {
    const candidate = i === 0 ? name : `${stem}-${i}${ext}`;
    try {
      writeFileSync(join(dir, candidate), body, { flag: 'wx' });
      return candidate;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
    }
  }
}

export function createFetchPage({ root = defaultRoot() } = {}) {
  return createServer((req, res) =>
    handle(root, req, res).catch((err) => {
      if (!res.headersSent) send(res, 500, 'text/plain', err.message);
      else res.destroy();
    }));
}

// The request handler on its own, so the factory dashboard can mount it later.
export async function handle(root, req, res) {
  const url = new URL(req.url, 'http://127.0.0.1');
  // Bound to 127.0.0.1, so only this machine connects. A web page in the user's browser still
  // can: refuse any Host but this one (DNS rebinding) and any cross-site Origin on a drop.
  const port = req.socket.localPort;
  const self = [`127.0.0.1:${port}`, `localhost:${port}`];
  if (!self.includes(req.headers.host)) return send(res, 403, 'text/plain', 'local requests only');
  const origin = req.headers.origin;
  if (req.method !== 'GET' && origin !== undefined && !self.some((h) => origin === `http://${h}`)) {
    return send(res, 403, 'text/plain', 'cross-site drop refused');
  }
  if (req.method === 'POST' && url.pathname === '/drop') {
    const ref = url.searchParams.get('ref');
    const failure = openFailures(root).get(ref);
    if (!failure) return send(res, 404, 'text/plain', `no open fetch.failed event for ref ${ref}`);
    if (!SAFE_REF.test(ref)) return send(res, 400, 'text/plain', `ref ${ref} is not a plain folder name`);
    const body = Buffer.concat(await Array.fromAsync(req));
    const dir = `research/refs/${ref}/raw`;
    mkdirSync(join(root, dir), { recursive: true });
    const rel = `${dir}/${saveNew(join(root, dir), safeName(url.searchParams.get('name')), body)}`;
    writeEvent({ root, run: failure.run, agent: AGENT, type: 'artifact', fields: { path: rel, kind: 'ref', ref } });
    return send(res, 201, 'application/json', JSON.stringify({ path: rel }));
  }
  if (req.method === 'GET' && url.pathname === '/') return send(res, 200, 'text/html', page(openRefs(root)));
  send(res, 404, 'text/plain', 'not found');
}

// One row per open ref: { ref, title, url, reason, run, ts }. The title comes from the
// fetch.failed event's optional title field, else research/refs/catalog.tsv, else is empty.
export function openRefs(root) {
  const titles = catalogTitles(root);
  return [...openFailures(root).values()].map((e) => ({
    ref: e.ref, title: e.title || titles.get(e.ref) || '', url: e.url, reason: e.reason, run: e.run, ts: e.ts,
  }));
}

// The catalog (issue #5) may not exist yet. Reads a header row naming a bibkey (or key/ref)
// column and a title column; anything else yields no titles.
function catalogTitles(root) {
  const titles = new Map();
  let text;
  try {
    text = readFileSync(join(root, 'research', 'refs', 'catalog.tsv'), 'utf8');
  } catch {
    return titles;
  }
  const [header, ...rows] = text.split(/\r?\n/).map((l) => l.split('\t'));
  const keyCol = header.findIndex((h) => ['bibkey', 'key', 'ref'].includes(h.trim().toLowerCase()));
  const titleCol = header.findIndex((h) => h.trim().toLowerCase() === 'title');
  if (keyCol < 0 || titleCol < 0) return titles;
  for (const cells of rows) if (cells[keyCol] && cells[titleCol]) titles.set(cells[keyCol], cells[titleCol]);
  return titles;
}

// Event fields and catalog cells are untrusted text; escape all of it.
const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ENTITIES[c]);

function row(r) {
  const link = /^https?:\/\//i.test(r.url)
    ? `<a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${esc(r.url)}</a>`
    : `<span class="bad-url">${esc(r.url)}</span>`;
  return `<li class="ref" data-ref="${esc(r.ref)}">
  <div class="head"><span class="title${r.title ? '' : ' none'}">${esc(r.title || 'No title in the event or catalog')}</span><code>${esc(r.ref)}</code></div>
  <div class="link">${link}</div>
  <div class="reason">${esc(r.reason)}</div>
  <label class="zone">Drop the file here or <span class="pick">choose a file</span><input type="file" hidden></label>
  <div class="msg" role="status"></div>
</li>`;
}

function page(refs) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Fetch Page</title>
<style>
:root { --bg: #f7f7f5; --card: #fff; --fg: #1d1d1b; --muted: #6b6b66; --line: #deded8; --accent: #2f6fdf; --bad: #b3261e; --over: #e8f0fd; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #161615; --card: #1f1f1d; --fg: #ececea; --muted: #a0a09a; --line: #34342f; --accent: #7aa5f5; --bad: #f2867c; --over: #1d2a40; } }
:root[data-theme="dark"] { --bg: #161615; --card: #1f1f1d; --fg: #ececea; --muted: #a0a09a; --line: #34342f; --accent: #7aa5f5; --bad: #f2867c; --over: #1d2a40; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width: 860px; margin: 0 auto; padding: 32px 16px; }
h1 { font-size: 22px; margin: 0 0 4px; }
.sub { color: var(--muted); margin: 0 0 24px; }
ul { list-style: none; padding: 0; margin: 0; display: grid; gap: 12px; }
.ref { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px; overflow-wrap: anywhere; }
.ref.over { background: var(--over); border-color: var(--accent); }
.ref.busy { opacity: .6; }
.head { display: flex; flex-wrap: wrap; gap: 4px 12px; align-items: baseline; }
.title { font-weight: 600; }
.title.none { color: var(--muted); font-weight: 400; font-style: italic; }
code { color: var(--muted); font-size: 13px; }
.link, .reason { font-size: 14px; margin-top: 4px; }
.link a { color: var(--accent); }
.reason { color: var(--muted); }
.reason::before { content: "Failed: "; }
.zone { display: block; margin-top: 10px; padding: 10px; border: 1.5px dashed var(--line); border-radius: 8px; text-align: center; color: var(--muted); font-size: 14px; cursor: pointer; }
.ref.over .zone { border-color: var(--accent); color: var(--accent); }
.pick { color: var(--accent); text-decoration: underline; }
.msg { font-size: 13px; color: var(--bad); margin-top: 6px; }
.msg:empty { display: none; }
.empty { color: var(--muted); padding: 24px 0; }
</style>
</head>
<body>
<main>
<h1>References to fetch</h1>
<p class="sub">The agents could not download these. Drop each file on its row; it is saved to <code>research/refs/&lt;ref&gt;/raw/</code>.</p>
<ul id="refs">${refs.map(row).join('\n')}</ul>
<p class="empty" id="empty"${refs.length ? ' hidden' : ''}>Nothing to fetch. Every failed reference has a file.</p>
</main>
<script>
addEventListener('dragover', (e) => e.preventDefault());
addEventListener('drop', (e) => e.preventDefault());
for (const row of document.querySelectorAll('.ref')) {
  const msg = row.querySelector('.msg');
  row.addEventListener('dragover', (e) => { e.preventDefault(); row.classList.add('over'); });
  row.addEventListener('dragleave', (e) => { if (!row.contains(e.relatedTarget)) row.classList.remove('over'); });
  row.addEventListener('drop', (e) => { e.preventDefault(); row.classList.remove('over'); upload(row, msg, e.dataTransfer.files); });
  row.querySelector('input').addEventListener('change', (e) => upload(row, msg, e.target.files));
}
async function upload(row, msg, files) {
  if (files.length !== 1) { msg.textContent = 'Drop one file at a time.'; return; }
  const f = files[0];
  row.classList.add('busy');
  msg.textContent = '';
  try {
    const res = await fetch('/drop?ref=' + encodeURIComponent(row.dataset.ref) + '&name=' + encodeURIComponent(f.name), { method: 'POST', body: f });
    if (!res.ok) throw new Error(await res.text());
    row.remove();
    document.getElementById('empty').hidden = document.querySelector('.ref') !== null;
  } catch (err) {
    msg.textContent = 'Not saved: ' + err.message;
  } finally {
    row.classList.remove('busy');
  }
}
</script>
</body>
</html>
`;
}

function send(res, status, type, body) {
  res.writeHead(status, { 'content-type': `${type}; charset=utf-8` });
  res.end(body);
}

cli(import.meta.url, {
  usage: 'node factory/fetch-page.mjs [--root <repo>] [--port 4174]',
  options: { root: 'string', port: 'string' },
}, ({ root = defaultRoot(), port = '4174' }) => {
  if (!/^\d+$/.test(port)) throw new UsageError(`--port must be a number, got: ${port}`);
  const server = createFetchPage({ root });
  server.listen(Number(port), '127.0.0.1', () => {
    process.stdout.write(`fetch page: http://127.0.0.1:${server.address().port}/ (root ${root})\n`);
  });
});
