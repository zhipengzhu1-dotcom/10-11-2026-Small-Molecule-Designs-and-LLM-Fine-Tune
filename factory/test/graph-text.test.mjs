// The graph's text overlay through its interface: TF-IDF per text node, exact cosine (spec #52,
// stories 34 and 45; issue #64). The rows reproduce spec #1's replaced decisions, by their real
// line numbers, among rows on other topics.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGraph } from '../graph.mjs';

const row = (line, decision, why, result = 'adopted') =>
  ({ ts: `2026-10-11T10:00:${String(line % 60).padStart(2, '0')}Z`, run: null, agent: 'orchestrator', type: 'decision', phase: 'project/x', decision, why, evidence: 'e', result, line });

const ROWS = [
  row(15, 'asked the #2 implementer to drop agent.stop events from internal side agents', 'the stream showed stops with no start'),
  row(18, 'merged and closed the tool scout report; it ranks arxiv-mcp-server first', 'the scout report is the input to the fetch tooling'),
  row(21, 'pushed intake/s1 to origin, and will push after each merge from now on', 'the user said ok, push; issue comments cite SHAs that only resolve once pushed'),
  row(28, 'flagged 12 paper inconsistencies for the verifier, such as 50 vs 51 domains and Table 1 mixing 2x and 4x Wait', 'they decide which numbers the brief can trust'),
  row(35, "reverted a catalog re-run that set numina's license to unknown; moved the changed page out of the repo", 'the cited version of the page is gone, so the current page is not the reference'),
  row(38, 'fetched geminithinking from the live page', 'the dataset card is the cited source'),
  row(41, 'the replication and its evaluation use only local open-source models; the brief must plan rule-based grading with a local model fallback', "the user said they won't use any online models, only local open-source ones"),
  row(43, 'supersedes line 41 (part): grade in tiers: rule-based first, then a local model, then Claude as judge for disagreements', 'the user said Claude can also act as the judge; the models being trained and evaluated stay local and open-source'),
  row(51, 'three points in the brief await the user: the base model, the budget and the eval set', 'the brief cannot fix them alone'),
  row(55, 'supersedes line 15: asked the #2 implementer to drop agent.stop events from Claude Code internal side agents', 'the stream showed stops with no start; the side agents are Claude Code internals'),
  row(56, 'supersedes line 18: merged and closed the tool scout report; it ranks arxiv-mcp-server first and recommends a fallback', 'the scout report is the input to the fetch tooling'),
  row(57, 'supersedes line 28: flagged 12 paper inconsistencies D-01 to D-12 for the verifier', 'they decide which numbers the brief can trust; the D-rows are in sections.md'),
  row(58, "supersedes line 35: reverted a catalog re-run that set numina's license to unknown; moved the changed live page to the scratchpad", 'the cited version of the page was not the live one'),
  row(59, 'supersedes line 38: fetched geminithinking from the Wayback snapshot of the page', 'the live dataset card changed after it was cited'),
  row(60, 'supersedes line 51: three points in the brief await the user: the base model is unsourced, the budget and the eval set', 'the brief cannot fix them alone; the base model needs a source'),
  row(71, 'withdraws line 21: pushed intake/s1 at 271c5ba as a one-off push the user approved; standing push-after-merge consent is withdrawn', 'one-off and standing push policy are separate asks'),
];

test('on spec #1\'s replaced rows, each recorded supersede or withdraw names its target as the rank-1 earlier neighbour', () => {
  const g = buildGraph(ROWS);
  const pairs = g.decisions.flatMap((d) => d.relations.map((r) => [d.line, r.line]));
  assert.equal(pairs.length, 8);
  for (const [later, earlier] of pairs) {
    const [first] = g.similar(`row:${later}`, { k: 1, among: (id) => id.startsWith('row:') && Number(id.slice(4)) < later });
    assert.equal(first?.id, `row:${earlier}`, `row ${later}`);
  }
});

test('similarity is exact cosine: a text scores 1 against itself, 0 against a text sharing no term, and ranks highest first', () => {
  const g = buildGraph([
    row(2, 'picked three epochs for the budget forcing run', 'the paper says three'),
    row(3, 'fetched the dataset card', 'tables need it'),
    row(4, 'picked three epochs', 'cheaper'),
  ]);
  const scores = g.similar({ text: 'picked three epochs for the budget forcing run\nthe paper says three' }, { k: 3 });
  assert.equal(scores[0].id, 'row:2');
  assert.ok(Math.abs(scores[0].score - 1) < 1e-9, String(scores[0].score));
  assert.equal(scores[1].id, 'row:4');
  assert.ok(scores[1].score > 0 && scores[1].score < 1);
  assert.equal(scores.length, 2, 'row:3 shares no term, so it is no neighbour');
});

test('the text nodes are decision rows (decision and why), hand-back reports and tickets (their titles)', () => {
  const g = buildGraph([
    row(2, 'chose qwen as the judge', 'it fits the VRAM cap'),
    { ts: '2026-10-12T09:00:00Z', run: 'r1', agent: 'a1', type: 'agent.stop', role: 'implementer', status: 'ISSUES', report: 'ISSUES: the judge overflows the VRAM cap on cold load' },
    { ts: '2026-10-12T09:00:01Z', run: 'r1', agent: 'orchestrator', type: 'ticket.graph', spec: 52, tickets: [{ number: 64, title: 'Precedent check inside decide', state: 'OPEN', status: 'ready', blockers: [] }] },
  ]);
  const ids = (q) => g.similar({ text: q }, { k: 5 }).map((s) => s.id);
  assert.deepEqual(ids('VRAM cap'), ['row:2', 'event:r1/a1:1']);
  assert.deepEqual(ids('precedent check'), ['issue:64']);
});

test('precedents are the 3 nearest earlier rows that still stand: an out row is never one', () => {
  const g = buildGraph([
    row(2, 'grade with a local judge model', 'only local models'),
    row(3, 'supersedes line 2: grade with a local judge model, then Claude for disagreements', 'Claude may judge'),
    row(4, 'grade answers by exact match first', 'rules are cheapest'),
    row(5, 'the local judge model is qwen', 'it fits 8 GB'),
    row(6, 'grade the eval with a judge model', 'the harness has one'),
    row(7, 'fetched the dataset card', 'tables need it'),
  ]);
  assert.equal(g.decision(2).label, 'out');
  const found = g.precedents('grade with a local judge model\nonly local models');
  assert.equal(found.length, 3);
  assert.ok(!found.some((p) => p.row.line === 2), 'row 2 is out');
  assert.deepEqual(found.map((p) => p.row.label), ['in', 'in', 'in']);
  assert.equal(found[0].row.line, 3);
  assert.ok(found.every((p, i) => i === 0 || p.score <= found[i - 1].score));
});
