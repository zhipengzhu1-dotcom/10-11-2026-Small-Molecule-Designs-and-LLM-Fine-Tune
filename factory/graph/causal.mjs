// The causal-order overlay of the node model (spec #52, stories 31, 32 and 38), behind
// buildGraph's interface. Pure, with no imports, like graph.mjs.
//
// Workers talk only to the orchestrator O (a star), so happens-before needs two numbers per event
// ([Mattern 1989] Thm. 11 on a star): `o`, O's count at the dispatch of the span the event is in,
// and `own`, the event's count in its agent's history. Both are computed here at read time from
// the stream's program order, and an agent's history runs across runs, since a resume can come in a
// later session. `ts` is never read: decision rows record when they were written, not when O acted.
//
// O's events are its activity events and the decision rows, in stream order. A worker's history
// splits into spans at each agent.start; its k-th span pairs with its k-th dispatch (aligned from
// the last one when the first dispatch on record is a resume, as for an agent launched before the
// dispatch hook existed). Messages back to O are receipts, read from what O wrote:
//   - a resume dispatch of agent X receives all of X's history so far;
//   - an `event:<run>/X:<n>` pointer receives up to that event;
//   - `agent:X` or `agent-X` (a worktree branch, a subagent transcript), X's activity file, a path X
//     logged as an artifact or a sha in X's check evidence receives X's history through the latest
//     span dispatched before the citing event. Paths and shas count with or without their `file:`
//     or `commit:` prefix, since spec #1's rows predate the pointer grammar.
// A citation of an event O had not yet dispatched is evidence, not a cause, and is left out.
//
//   clock(id)            { agent, o, own } for an event:/row: id, or undefined
//   happensBefore(a, b)  true when a happened before b
//   unacted(spec?)       the hand-backs no later decision or dispatch acted on, ISSUES and BLOCKED
//                        first: [{ id, agent, status, role, ticket, report }]
//   lifecycle(spec?)     each agent's start/stop token replay: a start adds a token, a stop takes
//                        one. A stop with none to take is the only problem: orphaned before any
//                        start, else doubled. Resumes, even one logged before the previous stop,
//                        replay clean: [{ id, agent, kind }]
// With `spec`, the two lists keep to agents with an event in a run that logged that spec's
// ticket graph.

const O = 'orchestrator';
const NAME = '[A-Za-z0-9][A-Za-z0-9_-]*';
const AGENT_ID = new RegExp(`(?<![A-Za-z0-9_])agent[:-](${NAME})`, 'g');
const AGENT_FILE = new RegExp(`agents/${NAME}/(${NAME})\\.jsonl`, 'g');
const EVENT = new RegExp(`event:(${NAME})/(${NAME}):([1-9]\\d*)`, 'g');
// A sha: 7 to 40 hex digits, at least one a letter and one a digit, not inside a word or an id
// such as a session's (`3ecf8aea-7d0f-…`).
const SHA = /(?<![\w-])(?=[0-9a-f]*[a-f])(?=[0-9a-f]*\d)[0-9a-f]{7,40}(?![\w-])/g;
const URGENT = new Set(['ISSUES', 'BLOCKED']);

const push = (map, key, value) => (map.has(key) ? map.get(key).push(value) : map.set(key, [value]));
const matches = (re, text) => [...text.matchAll(re)];
// Whether `text` names `path` as a whole path, not as part of a longer one; a folder (`dir/`) is
// named by any path inside it too.
const names = (text, path) => {
  for (let i = text.indexOf(path); i >= 0; i = text.indexOf(path, i + 1)) {
    if (!/[\w./-]/.test(text[i - 1] ?? ' ') && (path.endsWith('/') || !/[\w/-]/.test(text[i + path.length] ?? ' '))) return true;
  }
  return false;
};

// stream: [{ id, e }] in stream order, ids as graph.mjs names them (event:… and row:…).
export function causalOrder(stream) {
  const clocks = new Map();
  const position = new Map(stream.map((x, i) => [x.id, i]));
  const history = new Map(); // agent -> its [{ id, e }] in program order
  let count = 0;
  for (const x of stream) {
    push(history, x.e.agent, x);
    const own = x.e.agent === O ? ++count : history.get(x.e.agent).length;
    clocks.set(x.id, { agent: x.e.agent, o: x.e.agent === O ? own : 0, own });
  }
  const ours = history.get(O) ?? [];

  const dispatches = new Map(); // agent -> O's dispatches of it, in O's order
  for (const x of ours) if (x.e.type === 'dispatch' && x.e.to) push(dispatches, x.e.to, x);
  const spans = new Map(); // agent -> [{ o, dispatch, events }]; span 0 holds events before any start
  for (const [agent, events] of history) {
    if (agent === O) continue;
    const list = [{ events: [] }];
    for (const x of events) {
      if (x.e.type === 'agent.start') list.push({ events: [] });
      list.at(-1).events.push(x);
    }
    const ds = dispatches.get(agent) ?? [];
    const started = list.length - 1;
    const shift = ds[0]?.e.resume && started > ds.length ? started - ds.length : 0;
    let o = 0;
    list.forEach((span, k) => {
      span.dispatch = k > 0 ? ds[k - 1 - shift] : undefined;
      if (span.dispatch) o = Math.max(o, clocks.get(span.dispatch.id).own);
      span.o = o;
      for (const x of span.events) clocks.get(x.id).o = o;
    });
    spans.set(agent, list);
  }

  // Receipts: [{ agent, own, at }], O at count `at` has seen the agent's history through `own`.
  const receipts = [];
  const paths = new Map(); // artifact path -> agents that logged it
  const shas = new Map(); // sha in check evidence -> agents that logged it
  for (const [agent, events] of history) {
    if (agent === O) continue;
    for (const { e } of events) {
      if (e.type === 'artifact' && e.path) push(paths, e.path, agent);
      if (e.type === 'check') for (const [sha] of matches(SHA, String(e.evidence ?? ''))) push(shas, sha, agent);
    }
  }
  const latestBefore = (agent, at) => {
    const before = (spans.get(agent) ?? []).filter((s) => s.o < at && s.events.length);
    return before.length ? clocks.get(before.at(-1).events.at(-1).id).own : undefined;
  };
  const receive = (agent, own, at) => {
    if (agent !== O && own !== undefined) receipts.push({ agent, own, at });
  };
  for (const { id, e } of ours) {
    const at = clocks.get(id).own;
    if (e.type === 'dispatch' && e.resume && e.to) receive(e.to, latestBefore(e.to, at), at);
    const text = [e.decision, e.why, e.evidence, e.result, e.cause, e.target].filter((t) => typeof t === 'string').join(' ');
    for (const [, run, agent, line] of matches(EVENT, text)) {
      const c = clocks.get(`event:${run}/${agent}:${line}`);
      if (c && c.o < at) receive(agent, c.own, at);
    }
    const cited = new Set([...matches(AGENT_ID, text), ...matches(AGENT_FILE, text)].map((m) => m[1]));
    for (const [path, agents] of paths) if (names(text, path)) for (const a of agents) cited.add(a);
    for (const [sha] of matches(SHA, text)) {
      for (const [theirs, agents] of shas) if (theirs.startsWith(sha) || sha.startsWith(theirs)) for (const a of agents) cited.add(a);
    }
    for (const agent of cited) if (history.has(agent)) receive(agent, latestBefore(agent, at), at);
  }

  // The earliest count of O at which it has seen `agent`'s history through `own`.
  const seenAt = (agent, own) => Math.min(...receipts.filter((r) => r.agent === agent && r.own >= own).map((r) => r.at));
  const happensBefore = (a, b) => {
    const [x, y] = [clocks.get(a), clocks.get(b)];
    if (!x || !y || a === b) return false;
    if (x.agent === y.agent) return x.own < y.own;
    if (x.agent === O) return x.own <= y.o;
    return seenAt(x.agent, x.own) <= (y.agent === O ? y.own : y.o);
  };

  // Agents in scope: all, or those with an event in a run that logged spec s's ticket graph.
  const inScope = (spec) => {
    if (spec === undefined) return () => true;
    const runs = new Set(ours.filter((x) => x.e.type === 'ticket.graph' && x.e.spec === spec).map((x) => x.e.run));
    return (agent) => history.get(agent).some((x) => runs.has(x.e.run));
  };

  const ACTS = new Set(['decision', 'dispatch']);
  const unacted = (spec) => {
    const keep = inScope(spec);
    const lastActing = Math.max(0, ...ours.filter((x) => ACTS.has(x.e.type)).map((x) => clocks.get(x.id).own));
    const out = [];
    for (const [agent, list] of spans) {
      if (!keep(agent)) continue;
      for (const span of list) {
        for (const { id, e } of span.events) {
          if (e.type !== 'agent.stop' || seenAt(agent, clocks.get(id).own) <= lastActing) continue;
          const d = span.dispatch?.e;
          out.push({ id, agent, status: e.status ?? 'unknown', role: d?.role ?? e.role, ticket: d?.ticket, report: e.report });
        }
      }
    }
    const rank = (h) => (URGENT.has(h.status) ? 0 : 1);
    return out.sort((a, b) => rank(a) - rank(b) || position.get(a.id) - position.get(b.id));
  };

  const lifecycle = (spec) => {
    const keep = inScope(spec);
    const out = [];
    for (const [agent, events] of history) {
      if (agent === O || !keep(agent)) continue;
      let started = false;
      let running = 0; // tokens: starts not yet matched by a stop
      for (const { id, e } of events) {
        if (e.type === 'agent.start') (started = true), running++;
        else if (e.type === 'agent.stop') {
          if (running) running--;
          else out.push({ id, agent, kind: started ? 'doubled stop' : 'orphaned stop' });
        }
      }
    }
    return out;
  };

  return {
    clock: (id) => clocks.get(id) && { ...clocks.get(id) },
    happensBefore,
    unacted,
    lifecycle,
  };
}
