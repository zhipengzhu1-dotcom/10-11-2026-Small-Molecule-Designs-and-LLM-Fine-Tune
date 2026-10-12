// Throwaway (#38). Rerun of #28's 12-pair precedent test (agent aa93f7f0's embed-eval.mjs) with dedicated
// embedders. Same rows, same pairs, same text, same candidates (every earlier row); adds query/doc prompts
// and RRF fusion, and reads size_vram from /api/ps after each model's call.
//   node embed.mjs <decisions.tsv> <out.json> <ollama base url>
import { readFileSync, writeFileSync } from 'node:fs';

const [file, out, base = 'http://127.0.0.1:11434'] = process.argv.slice(2);
const rows = [];
readFileSync(file, 'utf8').split(/\r?\n/).forEach((l, i) => {
  if (i === 0 || !l) return;
  const [ts, phase, decision, why, evidence, result] = l.split('\t');
  rows.push({ line: i + 1, ts, phase, decision, why, evidence, result });
});
const pairs = [];
for (const r of rows) {
  const m = /supersedes line (\d+)/.exec(r.decision);
  if (m) pairs.push({ q: r.line, t: Number(m[1]), how: 'explicit' });
  const p = /supersedes the grading part of (\S+)/.exec(r.evidence);
  if (p) pairs.push({ q: r.line, t: rows.find((x) => x.phase === p[1]).line, how: 'explicit' });
}
for (const [q, t] of [[71, 21], [51, 3], [47, 43], [49, 45], [64, 44]]) pairs.push({ q, t, how: 'hand' });
const byLine = new Map(rows.map((r) => [r.line, r]));
const strip = (s) => s.replace(/^supersedes line \d+:\s*/, '').replace(/;?\s*supersedes the grading part of \S+/, '');
const text = (r) => `${strip(r.decision)}. ${strip(r.why)}`;
const docs = rows.map(text);

const tok = (s) => s.toLowerCase().match(/[a-z0-9][a-z0-9._-]*/g) ?? [];
function tfidf(ds) {
  const df = new Map();
  const tfs = ds.map((d) => { const tf = new Map(); for (const w of tok(d)) tf.set(w, (tf.get(w) ?? 0) + 1); for (const w of tf.keys()) df.set(w, (df.get(w) ?? 0) + 1); return tf; });
  const idx = new Map([...df.keys()].map((w, i) => [w, i]));
  return tfs.map((tf) => { const v = new Float64Array(idx.size); for (const [w, c] of tf) v[idx.get(w)] = (1 + Math.log(c)) * Math.log(ds.length / df.get(w)); return v; });
}
const norm = (v) => { let n = 0; for (const x of v) n += x * x; n = Math.sqrt(n) || 1; return Array.from(v, (x) => x / n); };
const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

async function embed(model, input) {
  const t0 = performance.now();
  const res = await fetch(`${base}/api/embed`, { method: 'POST', body: JSON.stringify({ model, input, keep_alive: '120s' }) });
  if (!res.ok) throw new Error(`${model}: ${res.status} ${await res.text()}`);
  const j = await res.json();
  const ps = await (await fetch(`${base}/api/ps`)).json();
  const loaded = ps.models.find((x) => x.name === model || x.model === model);
  return { vecs: j.embeddings.map(norm), ms: performance.now() - t0, size: loaded?.size, size_vram: loaded?.size_vram, ctx: loaded?.context_length };
}

// Prompt strings. EmbeddingGemma: "task: search result | query: {content}" / "title: none | text: {content}"
// [arXiv 2509.20354 §2]. Qwen3-Embedding: instruction on the query only, documents unchanged [arXiv 2506.05176 §2],
// in the model card's "Instruct: {task}\nQuery:{query}" form.
const QWEN_TASK = 'Given a new decision from a project log, retrieve earlier decisions on the same question';
const variants = [
  { name: 'embeddinggemma plain', model: 'embeddinggemma:300m', q: (s) => s, d: (s) => s },
  { name: 'embeddinggemma prompted', model: 'embeddinggemma:300m', q: (s) => `task: search result | query: ${s}`, d: (s) => `title: none | text: ${s}` },
  { name: 'qwen3-embedding plain', model: 'qwen3-embedding:0.6b', q: (s) => s, d: (s) => s },
  { name: 'qwen3-embedding instructed', model: 'qwen3-embedding:0.6b', q: (s) => `Instruct: ${QWEN_TASK}\nQuery:${s}`, d: (s) => s },
];

const methods = {};
const tv = tfidf(docs).map(norm);
methods['tfidf'] = { Q: tv, D: tv, dim: tv[0].length };
for (const v of variants) {
  const dq = docs.map(v.q), dd = docs.map(v.d);
  const D = await embed(v.model, dd);
  const Q = dq.every((s, i) => s === dd[i]) ? D : await embed(v.model, dq);
  methods[v.name] = { Q: Q.vecs, D: D.vecs, dim: D.vecs[0].length, embedMs: Math.round(D.ms + (Q === D ? 0 : Q.ms)), size: D.size, size_vram: D.size_vram, ctx: D.ctx };
}

const segs = (p) => p.split('/');
const shared = (a, b) => { let k = 0; while (k < a.length && k < b.length && a[k] === b[k]) k++; return k; };
const treeScore = (q, r) => { const a = segs(q.phase), b = segs(r.phase); return -(a.length + b.length - 2 * shared(a, b)) + r.line / 1e4; };

const idxOf = new Map(rows.map((r, i) => [r.line, i]));
const before = (q) => rows.filter((r) => r.ts < q.ts || (r.ts === q.ts && r.line < q.line));
function ranking(name, q) {
  if (name === 'phaseTree') return before(q).map((r) => ({ line: r.line, s: treeScore(q, r) })).sort((a, b) => b.s - a.s);
  if (name.startsWith('RRF(')) {
    // RRF score = sum over systems of 1/(60 + rank) [Cormack et al. 2009 §1].
    const parts = name.slice(4, -1).split(' + ');
    const acc = new Map();
    for (const p of parts) ranking(p, q).forEach((x, i) => acc.set(x.line, (acc.get(x.line) ?? 0) + 1 / (60 + i + 1)));
    return [...acc].map(([line, s]) => ({ line, s })).sort((a, b) => b.s - a.s);
  }
  const { Q, D } = methods[name];
  return before(q).map((r) => ({ line: r.line, s: dot(Q[idxOf.get(q.line)], D[idxOf.get(r.line)]) })).sort((a, b) => b.s - a.s);
}

const names = [...Object.keys(methods), 'phaseTree'];
const dense = variants.map((v) => v.name);
for (const d of dense) names.push(`RRF(tfidf + ${d})`);
names.push('RRF(tfidf + phaseTree)');
for (const d of dense) names.push(`RRF(tfidf + phaseTree + ${d})`);

const report = { n: rows.length, pairs, methods: {} };
for (const name of names) {
  const per = pairs.map((p) => {
    const sc = ranking(name, byLine.get(p.q));
    const rank = sc.findIndex((x) => x.line === p.t) + 1;
    return { pair: `${p.q}->${p.t}`, how: p.how, rank, of: sc.length, s: +sc[rank - 1].s.toFixed(3) };
  });
  const sum = (xs) => ({ mrr: +(xs.reduce((s, x) => s + 1 / x.rank, 0) / xs.length).toFixed(3), r1: `${xs.filter((x) => x.rank === 1).length}/${xs.length}`, r3: `${xs.filter((x) => x.rank <= 3).length}/${xs.length}` });
  const m = methods[name];
  const entry = { all: sum(per), explicit: sum(per.filter((x) => x.how === 'explicit')), hand: sum(per.filter((x) => x.how === 'hand')), per };
  if (m) {
    const cs = [];
    for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) cs.push(dot(m.D[i], m.D[j]));
    cs.sort((a, b) => a - b);
    Object.assign(entry, { dim: m.dim, embedMs: m.embedMs, size: m.size, size_vram: m.size_vram, ctx: m.ctx, cosMedian: +cs[cs.length >> 1].toFixed(3), cosMax: +cs.at(-1).toFixed(3) });
  }
  report.methods[name] = entry;
}
writeFileSync(out, JSON.stringify(report, null, 1));
for (const [k, e] of Object.entries(report.methods)) {
  console.log(`${k.padEnd(52)} all MRR ${e.all.mrr} r@1 ${e.all.r1} | expl ${e.explicit.mrr} ${e.explicit.r1} | hand ${e.hand.mrr} ${e.hand.r1}` + (e.dim ? ` | d=${e.dim} med cos ${e.cosMedian} vram ${e.size_vram} ms ${e.embedMs}` : ''));
  console.log('   ', e.per.map((x) => `${x.pair}:${x.rank}`).join(' '));
}
