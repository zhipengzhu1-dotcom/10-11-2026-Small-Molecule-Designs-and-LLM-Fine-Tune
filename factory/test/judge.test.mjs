// The judge client (issue #64) with fetch injected, as the qwen review tests do: no Ollama, no model.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createJudge } from '../judge.mjs';

function fakeOllama(content) {
  const requests = [];
  const fetch = async (url, init) => {
    requests.push({ url, body: JSON.parse(init.body) });
    return { ok: true, status: 200, json: async () => ({ message: { role: 'assistant', content }, done_reason: 'stop' }) };
  };
  return { fetch, requests };
}

const EARLIER = { line: 41, text: 'the replication uses only local open-source models', why: 'the user said so' };
const LATER = { text: 'grade with Claude as judge for disagreements', why: 'the user said Claude may judge' };

test('the judge asks local qwen3.5:4b about one pair per call, with thinking off, and returns its verdict and reason', async () => {
  const { fetch, requests } = fakeOllama('{"verdict":"contradicts","why":"Claude is not a local model"}');
  const judge = createJudge({ fetch });
  assert.deepEqual(await judge(EARLIER, LATER), { verdict: 'contradicts', why: 'Claude is not a local model' });
  assert.equal(requests.length, 1);
  const { url, body } = requests[0];
  assert.equal(url, 'http://127.0.0.1:11434/api/chat');
  assert.equal(body.model, 'qwen3.5:4b');
  assert.equal(body.think, false);
  assert.equal(body.stream, false);
  assert.equal(body.messages.length, 1);
  const prompt = body.messages[0].content;
  for (const s of [EARLIER.text, EARLIER.why, LATER.text, LATER.why]) assert.ok(prompt.includes(s), s);
  assert.ok(prompt.indexOf(EARLIER.text) < prompt.indexOf(LATER.text), 'the earlier row comes first');
  assert.deepEqual(body.format.properties.verdict.enum, ['contradicts', 'consistent']);
});

// The writer filters corrects pairs after the judge, so the prompt never names a relation.
test('the prompt names no relation between the rows', async () => {
  const { fetch, requests } = fakeOllama('{"verdict":"consistent","why":"-"}');
  await createJudge({ fetch })(EARLIER, LATER);
  assert.doesNotMatch(requests[0].body.messages[0].content, /\b(supersedes|withdraws|corrects)\b/);
});

// The merge read (issue #69) asks about a worker's hand-back report rather than a new row.
test('a later text of kind report is put to the judge as a hand-back report against the standing decision', async () => {
  const { fetch, requests } = fakeOllama('{"verdict":"contradicts","why":"the report used Claude"}');
  const report = { text: 'PASS. Graded the disagreements with Claude.', kind: 'report' };
  assert.deepEqual(await createJudge({ fetch })(EARLIER, report), { verdict: 'contradicts', why: 'the report used Claude' });
  const prompt = requests[0].body.messages[0].content;
  assert.match(prompt, /hand-back report/);
  assert.doesNotMatch(prompt, /NEW decision/);
  for (const s of [EARLIER.text, EARLIER.why, report.text]) assert.ok(prompt.includes(s), s);
  assert.ok(prompt.indexOf(EARLIER.text) < prompt.indexOf(report.text), 'the standing decision comes first');
});

test('an answer that is not a verdict reads as unclear, never as consistent', async () => {
  for (const content of ['maybe', '{"verdict":"replaces"}', '']) {
    const { fetch } = fakeOllama(content);
    assert.equal((await createJudge({ fetch })(EARLIER, LATER)).verdict, 'unclear', JSON.stringify(content));
  }
});

test('the judge takes its host from the option, else FACTORY_JUDGE_HOST, and throws on an HTTP error or a refused connection', async () => {
  const { fetch, requests } = fakeOllama('{"verdict":"consistent","why":"-"}');
  await createJudge({ fetch, env: { FACTORY_JUDGE_HOST: 'http://10.0.0.2:9/' } })(EARLIER, LATER);
  await createJudge({ fetch, host: 'http://10.0.0.3:9', env: { FACTORY_JUDGE_HOST: 'http://10.0.0.2:9' } })(EARLIER, LATER);
  assert.deepEqual(requests.map((r) => r.url), ['http://10.0.0.2:9/api/chat', 'http://10.0.0.3:9/api/chat']);

  const http = async () => ({ ok: false, status: 404, text: async () => 'model "qwen3.5:4b" not found' });
  await assert.rejects(createJudge({ fetch: http })(EARLIER, LATER), /Ollama HTTP 404: model "qwen3.5:4b" not found/);
  const refused = async () => { throw new TypeError('fetch failed', { cause: new Error('connect ECONNREFUSED 127.0.0.1:11434') }); };
  await assert.rejects(createJudge({ fetch: refused })(EARLIER, LATER), /fetch failed \(connect ECONNREFUSED 127\.0\.0\.1:11434\)/);
});
