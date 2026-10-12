// The assurance-case overlay of the node model (spec #52, stories 12 and 37), behind buildGraph's
// interface. Pure, with no imports, like graph.mjs. GSN's goal / solution / undeveloped skeleton
// with eliminative (Baconian) residual doubt: doubts are counted, never multiplied
// (research/assurance-case:research/orchestration/assurance-case.md, sections 1 and 6).
//
// Doubts are challenges. A logged `challenge` event is one; so are, read at this time and never
// logged twice, a failed check, an ISSUES, BLOCKED or unknown stop and a `fetch.failed`. Each is an
// argument in graph.mjs's grounded labelling, attacked by what eliminates it, so a closing row that
// is itself out brings its challenge back. A logged challenge whose target is `row:<N>` attacks
// that row. What eliminates a challenge (each a later record naming it, never an edit):
//   challenge     a `challenge.eliminated` event of=<id>, or a row that `closes challenge <id>`
//   failed check  a later pass of the same name, with the same ticket or none
//   stop          a later PASS stop of the same agent, or of an agent dispatched for the same
//                 ticket in the same role
//   fetch.failed  a later artifact with that `ref`, or a path under research/refs/<ref>/raw/
// and any read-time one by a row citing its event id (`event:<run>/<agent>:<line>`).
//
// Goals are the spec's user stories, `snapshot.stories` (the frontier logs them from the spec).
// Their evidence is the story map, `snapshot.map` ([{ story, kind, name }], kind check, test or
// none), and the latest result of each named check event or test, the tests read from
// `snapshot.results` ({ <test-results artifact path>: [{ name, result }] }). The reader supplies the
// map and the results, as it supplies the merges.
//
//   challenges(spec?)  [{ id, source, kind, target, why, ticket, node, label, open }], `id` the
//                      logged id or the event id; with `spec`, those in a run that logged the
//                      spec's ticket graph or about one of its tickets
//   goals()            [{ story, status, evidence: [{ kind, name, result, at }], doubts }], status
//                      undeveloped (no map row), none (only a none row), unrun (no result yet),
//                      failing (an open doubt on its evidence) or supported
//   done(spec)         { goals (those not supported), challenges (open), undec (rows), completion,
//                      listed (whether the snapshot lists the stories), residual (distinct doubts) }

const STOPS = new Set(['ISSUES', 'BLOCKED', 'unknown']);
const KIND = { check: 'rebut', stop: 'rebut', 'fetch.failed': 'undermine' };

// Whether `text` cites event `id`, not a longer line number that starts with it.
const cites = (text, id) => {
  for (let i = text.indexOf(id); i >= 0; i = text.indexOf(id, i + 1)) if (!/\d/.test(text[i + id.length] ?? '')) return true;
  return false;
};

// Every challenge in the stream, with `arg` (its argument in the labelling), `row` (the row it
// attacks, if any) and `by` (its attackers: row lines and the event ids of eliminating events).
// `activities` are [{ id, e }] in stream order.
export function challengesOf(activities, decisions) {
  const dispatched = new Map(); // agent -> its first dispatch
  for (const { e } of activities) if (e.type === 'dispatch' && e.to && !dispatched.has(e.to)) dispatched.set(e.to, e);
  const rowsCiting = (id) => decisions.filter((d) => [d.decision, d.why, d.evidence, d.result].some((t) => cites(t ?? '', id))).map((d) => d.line);
  const later = (i, test) => activities.slice(i + 1).filter((x) => test(x.e)).map((x) => x.id);

  const out = [];
  activities.forEach(({ id, e }, i) => {
    if (e.type === 'challenge') {
      const by = [
        ...activities.filter((x) => x.e.type === 'challenge.eliminated' && x.e.of === e.id).map((x) => x.id),
        ...decisions.filter((d) => d.relations.some((r) => r.kind === 'closes' && r.challenge === e.id)).map((d) => d.line),
      ];
      const row = /^row:(\d+)$/.exec(e.target ?? '')?.[1];
      out.push({ id: e.id, source: 'challenge', kind: e.kind, target: e.target, why: e.why, ticket: e.ticket, node: id, run: e.run, by, row: row && Number(row) });
      return;
    }
    let source;
    let by = [];
    let ticket = e.ticket;
    let why;
    if (e.type === 'check' && e.result === 'fail') {
      source = 'check';
      why = `check ${e.name} fail: ${e.evidence}`;
      by = later(i, (x) => x.type === 'check' && x.name === e.name && x.result === 'pass' && (x.ticket === undefined || x.ticket === e.ticket));
    } else if (e.type === 'agent.stop' && STOPS.has(e.status)) {
      source = 'stop';
      const d = dispatched.get(e.agent);
      ticket = d?.ticket;
      why = e.report ?? '';
      const peer = (a) => a === e.agent || (d?.ticket !== undefined && dispatched.get(a)?.ticket === d.ticket && dispatched.get(a)?.role === d.role);
      by = later(i, (x) => x.type === 'agent.stop' && x.status === 'PASS' && peer(x.agent));
    } else if (e.type === 'fetch.failed') {
      source = 'fetch.failed';
      why = `fetch ${e.ref} failed: ${e.reason}`;
      by = later(i, (x) => x.type === 'artifact' && (x.ref === e.ref || (x.path ?? '').startsWith(`research/refs/${e.ref}/raw/`)));
    } else return;
    const kind = e.status === 'unknown' ? 'undermine' : KIND[source];
    out.push({ id, source, kind, target: ticket === undefined ? null : `issue:${ticket}`, why, ticket, node: id, run: e.run, by: [...by, ...rowsCiting(id)] });
  });
  return out.map((c) => ({ ...c, arg: `challenge:${c.id}` }));
}

// The overlay's queries, once graph.mjs has labelled every argument (`label`).
export function assurance(graph, activities, challenges, label, snapshot) {
  const all = challenges.map(({ arg, by, row, run, ...c }) => ({ ...c, run, label: label.get(arg), open: label.get(arg) !== 'out' }));
  const specRuns = (s) => new Set(activities.filter((x) => x.e.type === 'ticket.graph' && x.e.spec === s).map((x) => x.e.run));
  const specTickets = (s) => new Set([s, ...activities.filter((x) => x.e.type === 'ticket.graph' && x.e.spec === s).flatMap((x) => (x.e.tickets ?? []).map((t) => t.number))]);
  const challengesOf = (s) => {
    if (s === undefined) return all.map(({ run, ...c }) => c);
    const runs = specRuns(s);
    const tickets = specTickets(s);
    return all.filter((c) => runs.has(c.run) || tickets.has(c.ticket)).map(({ run, ...c }) => c);
  };

  const goals = () => {
    const latestCheck = new Map();
    const latestTest = new Map();
    for (const { id, e } of activities) {
      if (e.type === 'check') latestCheck.set(e.name, { result: e.result, at: id });
      if (e.type === 'artifact' && e.kind === 'test-results') {
        for (const t of snapshot?.results?.[e.path] ?? []) latestTest.set(t.name, { result: t.result, at: id, file: `file:${e.path}` });
      }
    }
    const rows = snapshot?.map ?? [];
    const stories = [...new Set([...(snapshot?.stories ?? []), ...rows.map((r) => r.story)])].sort((a, b) => a - b);
    const doubted = new Map(); // a challenge target -> the open logged challenges on it
    for (const c of all) if (c.open && c.source === 'challenge') doubted.set(c.target, [...(doubted.get(c.target) ?? []), c.id]);
    return stories.map((story) => {
      const mine = rows.filter((r) => r.story === story);
      if (!mine.length) return { story, status: 'undeveloped', evidence: [], doubts: [`story:${story}`] };
      const named = mine.filter((r) => r.kind !== 'none');
      if (!named.length) return { story, status: 'none', evidence: [], doubts: [`story:${story}`] };
      const doubts = [];
      const evidence = named.map(({ kind, name }) => {
        const r = (kind === 'check' ? latestCheck : latestTest).get(name);
        if (r?.result === 'fail') doubts.push(kind === 'check' ? r.at : `${r.at}#${name}`);
        for (const t of [r?.at, r?.file]) doubts.push(...(t ? doubted.get(t) ?? [] : []));
        return { kind, name, result: r?.result ?? null, at: r?.at ?? null };
      });
      if (doubts.length) return { story, status: 'failing', evidence, doubts: [...new Set(doubts)] };
      if (!evidence.some((x) => x.result === 'pass')) return { story, status: 'unrun', evidence, doubts: [`story:${story}`] };
      return { story, status: 'supported', evidence, doubts: [] };
    });
  };

  const done = (s) => {
    const open = challengesOf(s).filter((c) => c.open);
    const short = goals().filter((g) => g.status !== 'supported');
    return {
      goals: short,
      challenges: open,
      undec: graph.decisions.filter((d) => d.label === 'undec'),
      completion: graph.completion(),
      listed: Array.isArray(snapshot?.stories),
      residual: new Set([...short.flatMap((g) => g.doubts), ...open.map((c) => c.id)]).size,
    };
  };

  return { challenges: challengesOf, goals, done };
}
