// The trail review by per-pair judging (issue #65; spec #52, "Text and judge") on a fixture graph,
// with a fake judge injected in place of qwen3.5:4b: no Ollama, no model.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGraph } from '../graph.mjs';
import { reviewText, trailReview } from '../trail-review.mjs';

const row = (line, decision, why) =>
  ({ ts: '2026-10-11T10:00:00Z', run: null, agent: 'orchestrator', type: 'decision', phase: 'project/x', decision, why, evidence: 'e', result: 'adopted', line });

// Row 5 overrides row 2 in prose only, as L43 did L41 on spec #1. Row 4 is superseded by row 6.
const GRAPH = buildGraph([
  row(2, 'grade with a local judge model only', 'only local models'),
  row(3, 'fetched the dataset card', 'tables need it'),
  row(4, 'train for 5 epochs', 'the paper says 5'),
  row(5, 'grade with a local judge model, then Claude for disagreements', 'Claude may judge'),
  row(6, 'supersedes line 4: train for 3 epochs', 'the paper says 5 but 3 fits the cap'),
  row(7, 'corrects line 3: fetched the dataset card from the mirror', 'the card moved'),
  row(8, 'grade the eval with a local judge model at temperature 0', 'determinism'),
]);

// A judge that answers `contradicts` when the later row holds `later` and the earlier `earlier`.
function fakeJudge(flag = []) {
  const calls = [];
  const judge = async (earlier, later) => {
    calls.push([earlier.line, later.line]);
    const hit = flag.find((f) => earlier.text.includes(f.earlier) && later.text.includes(f.later));
    return hit ? { verdict: hit.verdict ?? 'contradicts', why: 'they disagree' } : { verdict: 'consistent', why: 'both stand' };
  };
  judge.model = 'fake-judge';
  return { judge, calls };
}

const ALL = [2, 3, 4, 5, 6, 7, 8];

test('each reviewed row is judged against its 3 nearest earlier rows that still stand, one call per pair, never a later or an out row', async () => {
  const { judge, calls } = fakeJudge();
  await trailReview({ graph: GRAPH, lines: ALL, judge });
  assert.ok(calls.length > 0);
  for (const [earlier, later] of calls) {
    assert.ok(earlier < later, `${earlier} is earlier than ${later}`);
    assert.equal(GRAPH.decision(earlier).label, 'in', `row ${earlier} still stands`);
  }
  assert.ok(!calls.some(([e]) => e === 4), 'row 4 is out and never judged');
  for (const line of ALL) assert.ok(calls.filter(([, l]) => l === line).length <= 3);
  assert.deepEqual(calls.filter(([, l]) => l === 5).map(([e]) => e), [2], 'row 5 shares terms only with row 2 among earlier standing rows');
  assert.equal(new Set(calls.map(([e, l]) => `${e}-${l}`)).size, calls.length, 'no pair is judged twice');
});

test('a row that is out itself is not reviewed: it replaces nothing', async () => {
  const { judge, calls } = fakeJudge();
  await trailReview({ graph: GRAPH, lines: [4], judge });
  assert.deepEqual(calls, []);
});

test('the review lists each flagged pair with the judge\'s label under a "reviewed by" line naming the judge', async () => {
  const { judge } = fakeJudge([{ earlier: 'local judge model only', later: 'then Claude' }]);
  const result = await trailReview({ graph: GRAPH, lines: ALL, judge });
  assert.equal(result.flags.length, 1);
  const text = reviewText({ session: 'sess-1-abcdef', lines: ALL, model: judge.model, ...result });
  assert.match(text, /^# Trail review, run sess-1-a$/m);
  assert.match(text, /^reviewed by fake-judge$/m);
  assert.match(text, /rows 2-8/);
  assert.match(text, new RegExp(`^1 of the ${result.judged} pairs judged is flagged\\.$`, 'm'));
  assert.match(text, /^- row:2 → row:5 \(0\.\d\d\) contradicts: they disagree$/m);
  assert.match(text, /^ {2}- row:2: grade with a local judge model only$/m);
  assert.match(text, /^ {2}- row:5: grade with a local judge model, then Claude for disagreements$/m);
});

test('an answer outside the schema is flagged as unclear', async () => {
  const { judge } = fakeJudge([{ earlier: 'local judge model only', later: 'temperature 0', verdict: 'unclear' }]);
  const result = await trailReview({ graph: GRAPH, lines: ALL, judge });
  const text = reviewText({ session: 's', lines: ALL, model: judge.model, ...result });
  assert.match(text, /^- row:2 → row:8 \(0\.\d\d\) unclear: they disagree$/m);
});

// A recorded relation is the log already saying so; a corrects pair is dropped after the judge,
// never named in its prompt (spec #52, Text and judge).
test('a contradiction the later row already marks, a corrects pair among them, is judged but never flagged', async () => {
  const { judge, calls } = fakeJudge([{ earlier: 'fetched the dataset card', later: 'from the mirror' }]);
  const result = await trailReview({ graph: GRAPH, lines: ALL, judge });
  assert.ok(calls.some(([e, l]) => e === 3 && l === 7), 'row 3 was judged against row 7');
  assert.deepEqual(result.flags, []);
});

test('a clean review says so plainly, with the pairs it judged', async () => {
  const { judge } = fakeJudge();
  const result = await trailReview({ graph: GRAPH, lines: [2, 5, 8], judge });
  const text = reviewText({ session: 's', lines: [2, 5, 8], model: judge.model, ...result });
  assert.match(text, /rows 2, 5, 8/);
  assert.match(text, new RegExp(`^No flags: none of the ${result.judged} pairs judged contradicts\\.$`, 'm'));
  assert.doesNotMatch(text, /^- row:/m);
});

test('the review states the number of nearest rows it was run with', async () => {
  const { judge } = fakeJudge();
  const result = await trailReview({ graph: GRAPH, lines: [5, 8], judge, k: 1 });
  const text = reviewText({ session: 's', lines: [5, 8], model: judge.model, ...result });
  assert.match(text, /against its 1 nearest earlier rows that still stand/);
  assert.equal(result.judged, 2);
});

test('a judge that throws stops the review: no partial review is returned', async () => {
  const judge = async () => { throw new Error('fetch failed (connect ECONNREFUSED 127.0.0.1:11434)'); };
  judge.model = 'qwen3.5:4b';
  await assert.rejects(trailReview({ graph: GRAPH, lines: ALL, judge }), /qwen3\.5:4b: fetch failed/);
});
