// The precedent check (issue #64; spec #52 stories 34 and 45) on a fixture graph, with a fake judge
// injected in place of qwen3.5:4b: no Ollama, no model.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGraph } from '../graph.mjs';
import { precedentRead } from '../precedent.mjs';

const row = (line, decision, why) =>
  ({ ts: '2026-10-11T10:00:00Z', run: null, agent: 'orchestrator', type: 'decision', phase: 'project/x', decision, why, evidence: 'e', result: 'adopted', line });

const GRAPH = buildGraph([
  row(2, 'grade with a local judge model', 'only local models'),
  row(3, 'supersedes line 2: grade with a local judge model, then Claude for disagreements', 'Claude may judge'),
  row(4, 'grade answers by exact match before any judge model', 'rules are cheapest'),
  row(5, 'the local judge model is qwen', 'it fits 8 GB'),
  row(6, 'grade the eval with the harness judge model', 'the harness has one'),
  row(7, 'fetched the dataset card', 'tables need it'),
]);

// A judge that answers `contradicts` for the earlier rows named in `against`, and records each pair.
function fakeJudge(against = []) {
  const calls = [];
  const judge = async (earlier, later) => {
    calls.push({ earlier, later });
    return against.some((s) => earlier.text.includes(s)) ? { verdict: 'contradicts', why: 'they disagree' } : { verdict: 'consistent', why: 'both stand' };
  };
  judge.model = 'fake-judge';
  return { judge, calls };
}

const NEW = { decision: 'grade with a local judge model only, never Claude', why: 'the user withdrew Claude as judge' };

test('the judge sees only the 3 nearest rows that still stand, one call per pair, and never an out row', async () => {
  const { judge, calls } = fakeJudge();
  await precedentRead({ graph: GRAPH, ...NEW, judge });
  assert.equal(calls.length, 3);
  assert.deepEqual(calls.map((c) => c.earlier.line).sort(), [3, 5, 6]);
  assert.ok(calls.every((c) => GRAPH.decision(c.earlier.line).label === 'in'));
  assert.deepEqual(calls[0].later, { text: NEW.decision, why: NEW.why });
});

test('a clean check is one line naming the rows judged', async () => {
  const { judge } = fakeJudge();
  const lines = await precedentRead({ graph: GRAPH, ...NEW, judge });
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^precedent: no contradiction among the 3 nearest standing rows \(row:3 0\.\d\d, row:\d 0\.\d\d, row:\d 0\.\d\d; judged by fake-judge\)$/);
});

test('a contradicted row the new row does not mark is flagged with the judge\'s reason and the flags that would mark it', async () => {
  const { judge } = fakeJudge(['then Claude']);
  const lines = await precedentRead({ graph: GRAPH, ...NEW, judge });
  assert.equal(lines[0], 'precedent: 1 of the 3 nearest standing rows may be replaced or reversed by this row; mark it with --supersedes, --withdraws or --corrects, or let it stand');
  assert.match(lines[1], /^ {2}row:3 0\.\d\d contradicts: grade with a local judge model, then Claude for disagreements$/);
  assert.equal(lines[2], '    judge: they disagree');
  assert.equal(lines.length, 3);
});

test('a contradiction the new row already marks with --supersedes or --withdraws is no flag', async () => {
  const { judge } = fakeJudge(['then Claude']);
  for (const kind of ['supersedes', 'withdraws']) {
    const lines = await precedentRead({ graph: GRAPH, ...NEW, relations: [{ kind, line: 3, part: true }], judge });
    assert.equal(lines.length, 1, kind);
    assert.match(lines[0], new RegExp(`^precedent: no contradiction .*row:3 0\\.\\d\\d \\(${kind}\\)`));
  }
});

// The judge is asked as for any pair; the relation is applied after it (spec #52, Text and judge).
test('a corrects pair is judged like any other but never reported as a contradiction', async () => {
  const { judge, calls } = fakeJudge(['then Claude']);
  const lines = await precedentRead({ graph: GRAPH, ...NEW, relations: [{ kind: 'corrects', line: 3, part: false }], judge });
  assert.ok(calls.some((c) => c.earlier.line === 3), 'row 3 was judged');
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^precedent: no contradiction .*row:3 0\.\d\d \(corrects\)/);
});

test('when the judge cannot be reached, the check says so and lists the nearest standing rows unjudged, asking no more', async () => {
  let asked = 0;
  const judge = async () => {
    asked += 1;
    throw new Error('fetch failed (connect ECONNREFUSED 127.0.0.1:11434)');
  };
  Object.assign(judge, { model: 'qwen3.5:4b', host: 'http://127.0.0.1:11434' });
  const lines = await precedentRead({ graph: GRAPH, ...NEW, judge });
  assert.equal(asked, 1);
  assert.equal(lines[0], 'precedent: judge unreachable (qwen3.5:4b at http://127.0.0.1:11434: fetch failed (connect ECONNREFUSED 127.0.0.1:11434)); the 3 nearest standing rows, unjudged:');
  assert.equal(lines.length, 4);
  assert.match(lines[1], /^ {2}row:3 0\.\d\d: grade with a local judge model, then Claude/);
});

test('with no similar standing row the judge is not asked, and the check is one line', async () => {
  const { judge, calls } = fakeJudge();
  const lines = await precedentRead({ graph: GRAPH, decision: 'pinned the transformers version', why: 'reproducible builds', judge });
  assert.equal(calls.length, 0);
  assert.deepEqual(lines, ['precedent: no earlier standing row is like this one']);
});
