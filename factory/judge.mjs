// The precedent judge (spec #52, "Text and judge"; issue #64): the local Ollama qwen3.5:4b says
// whether a new decision row contradicts one earlier row. One call per pair, thinking off (with it
// on, qwen can spend its whole output budget thinking). It sits outside the graph module, and every
// caller can inject it, so tests and Docker CI never load a model (story 46).
//
//   createJudge({ model, host, fetch, timeoutMs, env }) -> judge
//   await judge(earlier, later) -> { verdict: contradicts | consistent | unclear, why }
//       earlier, later: { text, why }, the decision after its relation phrase and its why cell;
//       a later { text, kind: 'report' } is a hand-back report, for the merge read (merge-read.mjs)
//
// Host: the option, else FACTORY_JUDGE_HOST, else http://127.0.0.1:11434. Not OLLAMA_HOST: that is
// the server's bind address and may be 0.0.0.0. A refused connection, a timeout or an HTTP error
// throws; the caller decides what that means. An answer outside the schema is `unclear`.
//
// The prompt names no relation the new row makes: a `corrects` pair is filtered out after the
// judge (precedent.mjs), so the judge sees every pair the same way.
export const JUDGE_MODEL = 'qwen3.5:4b';
const HOST = 'http://127.0.0.1:11434';
const VERDICTS = ['contradicts', 'consistent'];
// A pair fits easily. Without it Ollama loads the model's full 262,144-token context: qwen3.5:4b
// then takes 12.5 GiB (nvidia-smi delta), over the 8 GiB cap; at 2k it takes 3.9 GiB.
const NUM_CTX = 4096;

// Ollama structured output: the answer must be this JSON object.
const FORMAT = {
  type: 'object',
  properties: { verdict: { type: 'string', enum: VERDICTS }, why: { type: 'string' } },
  required: ['verdict', 'why'],
};

// A later text of kind `report` is a worker's hand-back report, judged before a merge (issue #69).
const reportPrompt = (earlier, report) => `A decision from one project's decision log, which still stands, and a worker's hand-back report on work about to be merged.
Does the work the report describes break, reverse or contradict the decision, in whole or in part? Answer "contradicts" if so. Answer "consistent" if the work keeps to the decision, including when they are on different topics.
Reply as JSON: {"verdict": "contradicts" or "consistent", "why": "<one short sentence>"}.

DECISION: ${earlier.text}
DECISION why: ${earlier.why ?? ''}

REPORT:
${report.text}`;

const prompt = (earlier, later) => (later.kind === 'report' ? reportPrompt(earlier, later) : `Two decisions from one project's decision log. The EARLIER one still stands.
Does the NEW decision replace, reverse or contradict the EARLIER one, in whole or in part? Answer "contradicts" if so. Answer "consistent" if both can stand together, including when they are on different topics.
Reply as JSON: {"verdict": "contradicts" or "consistent", "why": "<one short sentence>"}.

EARLIER decision: ${earlier.text}
EARLIER why: ${earlier.why ?? ''}

NEW decision: ${later.text}
NEW why: ${later.why ?? ''}`);

export function createJudge({ model = JUDGE_MODEL, host, fetch = globalThis.fetch, timeoutMs = 120_000, env = process.env } = {}) {
  const base = (host ?? env.FACTORY_JUDGE_HOST ?? HOST).replace(/\/$/, '');
  const judge = async (earlier, later) => {
    let res;
    try {
      res = await fetch(`${base}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt(earlier, later) }],
          stream: false,
          think: false,
          format: FORMAT,
          options: { temperature: 0, num_ctx: NUM_CTX },
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      throw new Error(`${err.message}${err.cause?.message ? ` (${err.cause.message})` : ''}`);
    }
    if (!res.ok) throw new Error(`Ollama HTTP ${res.status}: ${(await res.text()).trim()}`);
    const content = (await res.json()).message?.content ?? '';
    let answer;
    try {
      answer = JSON.parse(content);
    } catch {
      return { verdict: 'unclear', why: content.trim().slice(0, 200) };
    }
    return VERDICTS.includes(answer?.verdict) ? { verdict: answer.verdict, why: String(answer.why ?? '') } : { verdict: 'unclear', why: content.trim().slice(0, 200) };
  };
  judge.model = model;
  judge.host = base;
  return judge;
}
