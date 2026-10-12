// The tickets a decision row names: a `ticket-<n>` segment of its phase, or a `#<n>` in its
// decision. Shared by the binding query (graph.mjs) and the workflow net's explaining rows.
export const ticketsNamed = (d) => new Set([
  ...d.phase.split('/').map((p) => /^ticket-(\d+)$/.exec(p)?.[1]).filter(Boolean).map(Number),
  ...[...d.decision.matchAll(/#(\d+)\b/g)].map((m) => Number(m[1])),
]);
