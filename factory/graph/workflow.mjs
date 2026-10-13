// The workflow-net overlay of the node model (spec #52, stories 30 and 37): the ticket-graph
// snapshot as a workflow net, replayed against the stream. Pure, like graph.mjs.
//
// The net: each ticket of the snapshot (specs left out) has a `start` transition, its first
// dispatch, and a `merge` transition, its first `Merge #<n>` commit on the integration branch. A
// gated ticket (one with blockers) has one gate place; each blocker's merge puts a token in it,
// and the ticket's start consumes one token per blocker. The sink is reached when every ticket
// has merged. A ticket counts as merged only by its merge commit, never by GitHub's state, since
// tickets close only when the spec PR merges (decision row 100). Merge commits come in as the
// snapshot's `merges` ([{ ticket, ts, commit }]), which the reader gathers from git.
//
// Token replay runs online, in time order: a start whose gate lacks a blocker's token is an early
// start, and the token it lacked is owed until that blocker merges. A ticket closed on GitHub that
// never merged was dropped, so it leaves the net.
import { issueNumber, ticketsNamed } from './names.mjs';

export function workflow(graph, snapshot) {
  const merges = new Map();
  for (const m of snapshot?.merges ?? []) {
    if (!merges.has(m.ticket) || time(m.ts) < time(merges.get(m.ticket).ts)) merges.set(m.ticket, m);
  }
  const tickets = (snapshot?.tickets ?? [])
    .filter((t) => t.status !== 'spec' && !(t.state === 'CLOSED' && !merges.has(t.number)))
    .map((t) => t.number);
  const inNet = new Set(tickets);
  const blockers = new Map(tickets.map((t) => [t, []]));
  for (const e of graph.edges) {
    if (e.rel !== 'blockedBy') continue;
    const t = issueNumber(e.from);
    if (inNet.has(t)) blockers.get(t).push(issueNumber(e.to));
  }

  const starts = new Map(); // ticket -> its first dispatch node
  for (const n of graph.nodes) {
    const t = n.event?.ticket;
    if (n.type === 'dispatch' && inNet.has(t) && !starts.has(t)) starts.set(t, n);
  }
  // Merges sort before starts at the same instant: a start in the same second is not early.
  const steps = [
    ...[...merges.values()].map((m) => ({ at: time(m.ts), merge: m.ticket })),
    ...[...starts].map(([t, n]) => ({ at: time(n.event.ts), start: t, id: n.id })),
  ].sort((a, b) => a.at - b.at || ('merge' in b) - ('merge' in a));

  const gate = new Map(tickets.map((t) => [t, new Set()])); // tokens waiting in each gate place
  const owed = new Map(tickets.map((t) => [t, new Set()])); // tokens a start took before they came
  const early = [];
  for (const s of steps) {
    if ('merge' in s) {
      for (const t of tickets) {
        if (!blockers.get(t).includes(s.merge)) continue;
        if (owed.get(t).has(s.merge)) owed.get(t).delete(s.merge);
        else gate.get(t).add(s.merge);
      }
      continue;
    }
    for (const b of blockers.get(s.start)) {
      if (gate.get(s.start).delete(b)) continue;
      owed.get(s.start).add(b);
      early.push({ ticket: s.start, blocker: b, start: s.id, merged: merges.get(b)?.ts ?? null });
    }
  }

  const standing = graph.decisions.filter((d) => d.label === 'in').map((d) => [d.line, ticketsNamed(d)]);
  const earlyStarts = early.map((e) => ({
    ...e,
    explainedBy: standing.filter(([, named]) => named.has(e.ticket) && named.has(e.blocker)).map(([line]) => line),
  }));

  // Proper completion: the sink reached (every ticket merged) with every gate consumed (no token
  // left waiting for a start that never came, none still owed to a blocker that never merged).
  const unmerged = tickets.filter((t) => !merges.has(t));
  const gates = tickets
    .filter((t) => gate.get(t).size || owed.get(t).size)
    .map((t) => ({ ticket: t, tokens: [...gate.get(t)], owed: [...owed.get(t)] }));
  const completion = { proper: !unmerged.length && !gates.length, sink: !unmerged.length, unmerged, gates };

  return { earlyStarts, slack: slack(unmerged, blockers), completion };
}

// The critical path method over the tickets still to merge, each one step long (the spec rules out
// PERT estimates): earliest start is the longest chain of unmerged blockers before a ticket, latest
// start the latest it can begin without lengthening the whole, slack the gap. Merged blockers no
// longer hold anything up. A ticket on a blocker cycle has no schedule and is left out.
function slack(open, blockers) {
  const left = new Set(open);
  const before = new Map(open.map((t) => [t, blockers.get(t).filter((b) => left.has(b))]));
  const after = new Map(open.map((t) => [t, []]));
  for (const [t, bs] of before) for (const b of bs) after.get(b).push(t);
  const order = [];
  const waiting = new Map(open.map((t) => [t, before.get(t).length]));
  const ready = open.filter((t) => !waiting.get(t));
  while (ready.length) {
    const t = ready.shift();
    order.push(t);
    for (const d of after.get(t)) if (!waiting.set(d, waiting.get(d) - 1).get(d)) ready.push(d);
  }
  const earliest = new Map();
  for (const t of order) earliest.set(t, Math.max(0, ...before.get(t).map((b) => earliest.get(b) + 1)));
  const length = Math.max(0, ...[...earliest.values()].map((e) => e + 1));
  const latest = new Map();
  for (const t of [...order].reverse()) latest.set(t, Math.min(length, ...after.get(t).map((d) => latest.get(d))) - 1);
  return open.filter((t) => earliest.has(t)).map((t) => ({ ticket: t, earliest: earliest.get(t), latest: latest.get(t), slack: latest.get(t) - earliest.get(t) }));
}

const time = (ts) => Date.parse(ts);
