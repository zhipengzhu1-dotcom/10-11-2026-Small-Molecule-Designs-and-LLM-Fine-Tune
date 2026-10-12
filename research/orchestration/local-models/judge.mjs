// Throwaway (#38). Contradiction judges under the 8 GiB cap.
//   node judge.mjs <decisions.tsv> <base url> <model> <out.json>
// 1. #28's 12 labelled pairs with #28's prompt (A), and with a prompt that names which cells count (B).
// 2. The same pairs again, to check the answers repeat at temperature 0.
// 3. Trail review: the whole log (decision + why) in one call; must name 71 vs 21 and 43 vs 41.
// 4. size_vram at num_ctx 2048 and at the trail call's context.
import { readFileSync, writeFileSync } from 'node:fs';

const [file, base, model, out] = process.argv.slice(2);
const L = readFileSync(file, 'utf8').split(/\r?\n/);
const cell = (n) => L[n - 1].split('\t');
const row = (n) => { const c = cell(n); return `${c[2].replace(/^supersedes line \d+:\s*/, '')}. Why: ${c[3]}`; };
const pairs = [[41, 43, 'C'], [21, 71, 'C'], [18, 56, 'C'], [38, 59, 'C'], [15, 55, 'not C'], [28, 57, 'not C'], [35, 58, 'not C'], [51, 60, 'not C'], [43, 47, 'not C'], [45, 49, 'not C'], [11, 53, 'not C'], [3, 51, 'not C']];
const PROMPTS = {
  // Verbatim from #28's nli.mjs.
  A: 'You judge natural language inference between two decision records from one project log. Premise is the earlier record, hypothesis the later one. Answer with JSON {"label": "entailment" | "neutral" | "contradiction", "span": "<the words in the hypothesis that conflict, or empty>"}. Contradiction means both cannot be true or in force at once.',
  // A plus the cell rule #28 recommended ("decision and why cells only"), stated as a rule.
  B: 'You judge natural language inference between two decision records from one project log. Premise is the earlier record, hypothesis the later one. Answer with JSON {"label": "entailment" | "neutral" | "contradiction", "span": "<the words in the hypothesis that conflict, or empty>"}. Contradiction means the later record reverses, withdraws or replaces what the earlier one decided, so both decisions cannot stand at once. Compare only what was decided. A later record that only corrects which file, line or source the earlier one cited, or that adds detail while keeping the decision, is not a contradiction.',
};
// Send think:false only to models that advertise thinking; others reject the flag.
const show = await (await fetch(`${base}/api/show`, { method: 'POST', body: JSON.stringify({ model }) })).json();
const thinks = (show.capabilities ?? []).includes('thinking');
// Parse leniently: a reply wrapped in a ```json fence still counts, but is marked fenced.
const unfence = (t) => t.trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
const fenced = (t) => /^\s*```/.test(t);
async function chat(system, user, num_ctx, format = 'json') {
  const t0 = performance.now();
  const body = { model, stream: false, keep_alive: '120s', options: { temperature: 0, num_ctx, num_predict: 1500 }, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] };
  if (format) body.format = format;
  if (thinks) body.think = false;
  const res = await fetch(`${base}/api/chat`, { method: 'POST', body: JSON.stringify(body) });
  const j = await res.json();
  if (j.error) throw new Error(j.error);
  const ps = (await (await fetch(`${base}/api/ps`)).json()).models.find((x) => x.name === model);
  return { content: j.message.content, thinking: (j.message.thinking ?? '').length, ms: Math.round(performance.now() - t0), tin: j.prompt_eval_count, tout: j.eval_count, size: ps?.size, size_vram: ps?.size_vram, ctx: ps?.context_length };
}

const report = { model, pairs: {}, vram: {} };
for (const [pname, sys] of Object.entries(PROMPTS)) {
  for (const pass of [1, 2]) {
    const res = [];
    for (const [a, b, gold] of pairs) {
      const r = await chat(sys, `Premise (line ${a}): ${row(a)}\n\nHypothesis (line ${b}): ${row(b)}`, 2048);
      let o; try { o = JSON.parse(unfence(r.content)); } catch { o = { label: 'unparsed', span: r.content }; }
      const label = String(o.label ?? 'unparsed').toLowerCase();
      res.push({ pair: `${a}->${b}`, gold, label, span: String(o.span ?? '').slice(0, 140), ms: r.ms, tin: r.tin, tout: r.tout, thinkChars: r.thinking, fenced: fenced(r.content), raw: label === 'unparsed' ? r.content.slice(0, 200) : undefined });
      report.vram.ctx2048 = { size: r.size, size_vram: r.size_vram, ctx: r.ctx };
    }
    report.pairs[`${pname}${pass}`] = res;
  }
  const r1 = report.pairs[`${pname}1`], r2 = report.pairs[`${pname}2`];
  const C = r1.filter((x) => x.gold === 'C'), N = r1.filter((x) => x.gold !== 'C');
  const ms = r1.map((x) => x.ms).sort((x, y) => x - y);
  report[`summary${pname}`] = {
    caught: `${C.filter((x) => x.label === 'contradiction').length}/${C.length}`,
    falseAlarms: `${N.filter((x) => x.label === 'contradiction').length}/${N.length}`,
    unparsed: r1.filter((x) => !['entailment', 'neutral', 'contradiction'].includes(x.label)).length, fenced: r1.filter((x) => x.fenced).length, thinking: r1.filter((x) => x.thinkChars > 0).length,
    repeat: `${r1.filter((x, i) => x.label === r2[i].label).length}/${r1.length}`,
    msMedian: ms[ms.length >> 1], tinRange: `${Math.min(...r1.map((x) => x.tin))}-${Math.max(...r1.map((x) => x.tin))}`,
  };
}

// Trail review: every row's decision and why, numbered by file line. Same pointer stripping as the pair test,
// so the explicit "supersedes line N" rows don't give the answer away.
const lines = [];
for (let n = 2; n <= L.length; n++) if (L[n - 1]) { const c = cell(n); lines.push(`L${n} [${c[1]}] ${c[2].replace(/^supersedes line \d+:\s*/, '')}. Why: ${c[3]}`); }
const trailSys = 'You review an append-only project decision log. Each line is one decision with its reason. Find every case where a later line reverses, withdraws or overrides what an earlier line decided. Answer with JSON {"conflicts": [{"later": <line number>, "earlier": <line number>, "reason": "<short>"}]}. List each conflict once. If there are none, return an empty list.';
try {
  const r = await chat(trailSys, lines.join('\n'), 16384);
  let o; try { o = JSON.parse(unfence(r.content)); } catch { o = { conflicts: 'unparsed', raw: r.content.slice(0, 400) }; }
  const cs = Array.isArray(o.conflicts) ? o.conflicts.map((x) => `${x.later}->${x.earlier}`) : [];
  const want = ['71->21', '43->41', '55->15', '56->18', '57->28', '58->35', '59->38', '60->51'];
  report.trail = { fenced: fenced(r.content), thinkChars: r.thinking, tin: r.tin, tout: r.tout, ms: r.ms, found: cs, hitsAll: want.filter((w) => cs.includes(w)), unrecorded: ['71->21', '43->41'].filter((w) => cs.includes(w)), extra: cs.filter((c) => !want.includes(c)).length, raw: o.conflicts === 'unparsed' ? o.raw : undefined };
  report.vram.ctx16384 = { size: r.size, size_vram: r.size_vram, ctx: r.ctx };
} catch (e) { report.trail = { error: String(e) }; }

writeFileSync(out, JSON.stringify(report, null, 1));
console.log(model, JSON.stringify({ A: report.summaryA, B: report.summaryB, vram: report.vram, trail: { ...report.trail, found: report.trail.found?.join(' ') } }));
for (const k of ['A1', 'B1']) console.log(' ', k, report.pairs[k].map((x) => `${x.pair}:${x.gold === 'C' ? 'C' : 'n'}>${x.label[0]}`).join(' '));
