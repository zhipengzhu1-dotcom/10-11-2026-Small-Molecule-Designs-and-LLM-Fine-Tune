// The node model (spec #52): a typed graph built from the event stream every time it is read,
// never stored. Pure: it and everything it imports touch no file, network or model, so tests and
// Docker CI build it from fixture events; readers (the digest, the viewer) do the I/O around it.
//
//   buildGraph(events, snapshot?) -> graph
//     events    the event stream as readStream() returns it (each agent's events in file order)
//     snapshot  a ticket.graph event ({ spec, tickets }); defaults to the stream's latest
//
//   graph.nodes, graph.node(id)   PROV-DM nodes { id, class: agent|activity|entity, type, ... },
//                                 ids in the target grammar: agent:<id>, event:<run>/<agent>:<line>,
//                                 row:<N>, file:<path>, issue:<n>
//   graph.edges                   { from, rel, to }: wasAssociatedWith, wasAttributedTo,
//                                 wasGeneratedBy, blockedBy, subIssueOf, and the row relations
//                                 supersedes, withdraws, corrects (with `part`)
//   graph.decisions, .decision(N) the rows in line order, each with label (in|out|undec), parts
//                                 ([{ by, label }]), relations, text and state (claim.mjs)
//   graph.binding(n)              the standing decisions that bind ticket n: [{ row, because }]
//   graph.similar(query, opts)    TF-IDF neighbours of a text node or { text } (graph/text.mjs)
//   graph.precedents(text, k)     the k rows still in nearest to a text, as [{ row, score }]
//   graph.spec                    the snapshot's spec, or null with no snapshot
//   graph.earlyStarts()           starts before a blocker merged:
//                                 [{ ticket, blocker, start, merged, explainedBy }]
//   graph.slack()                 critical path of the unmerged tickets:
//                                 [{ ticket, earliest, latest, slack }]
//   graph.completion()            { proper, sink, unmerged, gates } for the done read
//   (the last three: the workflow net in graph/workflow.mjs; merges come in as snapshot.merges,
//    [{ ticket, ts, commit }], the integration branch's `Merge #<n>` commits)
//   graph.overdue(now, { run? })  running agents past their role's usual time (graph/sojourn.mjs)
//   graph.writtenTwice(paths?)    files two agents' artifact events wrote: [{ path, agents, writes }]
//   graph.staleChecks(paths?)     checks that ran before their file's last write:
//                                 [{ check, name, result, path, write }] (both graph/provenance.mjs)
//
// Overlays (argumentation here, the others in graph/) live here or in sibling files, without
// changing the interface.
import { claimState, parseRelations } from './claim.mjs';
import { ticketsNamed } from './graph/names.mjs';
import { provenanceOverlay } from './graph/provenance.mjs';
import { overdue } from './graph/sojourn.mjs';
import { textOverlay } from './graph/text.mjs';
import { workflow } from './graph/workflow.mjs';

export function buildGraph(events, snapshot = latest(events, 'ticket.graph')) {
  const nodes = new Map();
  const edges = [];
  const add = (id, cls, type, data = {}) => {
    if (!nodes.has(id)) nodes.set(id, { id, class: cls, type, ...data });
    return id;
  };
  const link = (from, rel, to, data = {}) => edges.push({ from, rel, to, ...data });
  const agent = (name) => add(`agent:${name}`, 'agent', 'agent');

  const decisions = [];
  const count = new Map(); // `<run>/<agent>` -> lines read so far: the event's line in its file
  for (const e of events) {
    if (e.type === 'decision') {
      const { relations, text } = parseRelations(e.decision ?? '');
      const d = { ...e, relations, text, state: claimState(e.result).state ?? null };
      decisions.push(d);
      link(add(`row:${d.line}`, 'entity', 'decision', { event: e }), 'wasAttributedTo', agent(e.agent));
      continue;
    }
    const file = `${e.run}/${e.agent}`;
    count.set(file, (count.get(file) ?? 0) + 1);
    const id = add(`event:${file}:${count.get(file)}`, 'activity', e.type, { event: e });
    link(id, 'wasAssociatedWith', agent(e.agent));
    if (e.type === 'dispatch' && e.to) agent(e.to);
    if (e.type === 'artifact' && e.path) link(add(`file:${e.path}`, 'entity', 'file'), 'wasGeneratedBy', id);
  }

  // Tickets: the snapshot's, with every blocked-by edge and spec any snapshot in the stream recorded,
  // since a snapshot lists only the blockers still open.
  const ticket = (n) => add(`issue:${n}`, 'entity', 'ticket');
  const seen = new Set();
  for (const s of [...events.filter((e) => e.type === 'ticket.graph'), snapshot ?? { tickets: [] }]) {
    for (const t of s.tickets ?? []) {
      ticket(t.number);
      const pairs = [...(t.blockers ?? []).map((b) => ['blockedBy', b]), ...(s.spec ? [['subIssueOf', s.spec]] : [])];
      for (const [rel, to] of pairs) {
        if (seen.has(`${t.number} ${rel} ${to}`)) continue;
        seen.add(`${t.number} ${rel} ${to}`);
        link(`issue:${t.number}`, rel, ticket(to));
      }
    }
  }
  for (const t of snapshot?.tickets ?? []) Object.assign(nodes.get(`issue:${t.number}`), { state: t.state, status: t.status, title: t.title });

  decisions.sort((a, b) => a.line - b.line);
  const byLine = new Map(decisions.map((d) => [d.line, d]));
  for (const d of decisions) {
    for (const r of d.relations) if (r.kind !== 'closes' && byLine.has(r.line)) link(`row:${d.line}`, r.kind, `row:${r.line}`, { part: r.part });
  }
  const label = grounded(attacks(decisions, byLine));
  for (const d of decisions) {
    d.label = label.get(d.line);
    d.parts = [...label].filter(([a]) => partOf(a) === d.line).map(([a, l]) => ({ by: partBy(a), label: l }));
  }
  const graph = {
    nodes: [...nodes.values()],
    edges,
    node: (id) => nodes.get(id),
    decisions,
    decision: (line) => byLine.get(line),
    spec: snapshot?.spec ?? null,
  };
  graph.binding = (n) => binding(graph, n);
  Object.assign(graph, textOverlay(graph));
  let net;
  const replay = () => (net ??= workflow(graph, snapshot));
  graph.earlyStarts = () => replay().earlyStarts;
  graph.slack = () => replay().slack;
  graph.completion = () => replay().completion;
  graph.overdue = (now, opts) => overdue(events, now, opts);
  Object.assign(graph, provenanceOverlay(graph));
  return graph;
}

// Claim states that put a rule in force; `open`, `assumed` and `cited` rows do not bind.
const BINDS = new Set(['adopted', 'given']);

// The standing decisions that bind ticket n, in log order, each with why it binds: `given` (a rule
// for every ticket), `#n` (the row names the ticket, by a `ticket-<n>` phase segment or `#<n>` in
// its decision), `blocker #k` (it names a ticket n is blocked by, directly or through another),
// or `spec #s` (it names the spec n belongs to).
function binding(graph, n) {
  const out = (id, rel) => graph.edges.filter((e) => e.from === id && e.rel === rel).map((e) => Number(e.to.slice(6)));
  const scope = new Map([[n, `#${n}`]]);
  const queue = [n];
  while (queue.length) {
    for (const b of out(`issue:${queue.shift()}`, 'blockedBy')) {
      if (!scope.has(b)) scope.set(b, `blocker #${b}`), queue.push(b);
    }
  }
  for (const s of out(`issue:${n}`, 'subIssueOf')) if (!scope.has(s)) scope.set(s, `spec #${s}`);
  const result = [];
  for (const d of graph.decisions) {
    if (d.label !== 'in' || !BINDS.has(d.state)) continue;
    const named = ticketsNamed(d);
    const because = d.state === 'given' ? 'given' : [...scope].find(([t]) => named.has(t))?.[1];
    if (because) result.push({ row: d, because });
  }
  return result;
}

const latest = (events, type) => events.findLast((e) => e.type === type);

// Arguments: a row is its line number; the part of row N that a partial relation of row M names
// is its own argument, `N/M`.
const ATTACKS = new Set(['supersedes', 'withdraws']);
const part = (line, by) => `${line}/${by}`;
const partOf = (a) => (typeof a === 'string' ? Number(a.split('/')[0]) : null);
const partBy = (a) => Number(a.split('/')[1]);

// Each argument's attackers, all of them rows. `withdraws` is a plain attack, so reinstatement
// applies. A whole `supersedes` also takes over every attack its target makes, so superseding a
// replacement never brings back what the replacement replaced. A partial relation attacks only the
// part it names; it takes over nothing, since a row's own relations belong to the whole row, which
// still stands and keeps making them. An attack on a row is an attack on each of its parts.
// `corrects` is no attack. Relations naming no row are left out.
function attacks(decisions, byLine) {
  const rel = (d) => d.relations.filter((r) => ATTACKS.has(r.kind) && byLine.has(r.line));
  const made = new Map(); // row -> the arguments it attacks, its own and those taken over
  const madeBy = (line, seen = new Set()) => {
    if (made.has(line)) return made.get(line);
    if (seen.has(line)) return [];
    seen.add(line);
    const out = new Set();
    for (const r of rel(byLine.get(line))) {
      out.add(r.part ? part(r.line, line) : r.line);
      if (r.kind === 'supersedes' && !r.part) for (const t of madeBy(r.line, seen)) out.add(t);
    }
    made.set(line, [...out]);
    return made.get(line);
  };
  const attackers = new Map(decisions.map((d) => [d.line, []]));
  for (const d of decisions) {
    for (const t of madeBy(d.line)) {
      if (!attackers.has(t)) attackers.set(t, []);
      attackers.get(t).push(d.line);
    }
  }
  for (const [a, by] of attackers) if (partOf(a) !== null) by.push(...attackers.get(partOf(a)));
  return attackers;
}

// Grounded labelling [Dung95 Def 20] as in/out/undec: an argument is in once all its attackers
// are out, out once any attacker is in; what never settles is undec.
function grounded(attackers) {
  const label = new Map();
  let changed = true;
  while (changed) {
    changed = false;
    for (const [a, by] of attackers) {
      if (label.has(a)) continue;
      const l = by.some((b) => label.get(b) === 'in') ? 'out' : by.every((b) => label.get(b) === 'out') ? 'in' : null;
      if (l) {
        label.set(a, l);
        changed = true;
      }
    }
  }
  for (const a of attackers.keys()) if (!label.has(a)) label.set(a, 'undec');
  return label;
}
