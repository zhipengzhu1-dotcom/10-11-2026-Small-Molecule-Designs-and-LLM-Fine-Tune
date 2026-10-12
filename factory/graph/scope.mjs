// What the node model's overlays read from the stream the same way: each agent's dispatches and a
// spec's runs. Pure, like the graph module. Entries are { e } or { id, e }, e an event, in stream
// order, so an overlay keeps the event ids it already has.

// Each agent's dispatches (launches and resumes, `to` the agent), in the orchestrator's order:
// Map(agent -> entries). The overlays pick from it: the first (the assurance case's ticket of a
// stop), the k-th for an agent's k-th span (the causal order), the last with a known role (the
// sojourn alarm).
export function dispatchesOf(entries) {
  const by = new Map();
  for (const x of entries) {
    if (x.e.type !== 'dispatch' || !x.e.to) continue;
    if (!by.has(x.e.to)) by.set(x.e.to, []);
    by.get(x.e.to).push(x);
  }
  return by;
}

// The runs that logged spec s's ticket graph: a spec's scope for the done read and the frontier's
// hand-back and lifecycle lists.
export const specRuns = (entries, s) => new Set(entries.filter((x) => x.e.type === 'ticket.graph' && x.e.spec === s).map((x) => x.e.run));
