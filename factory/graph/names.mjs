// What a record names, read one way for every overlay: tickets, ticket nodes and file paths. Pure.

// The tickets a decision row names: a `ticket-<n>` segment of its phase, or a `#<n>` in its
// decision. Shared by the binding query (graph.mjs) and the workflow net's explaining rows.
export const ticketsNamed = (d) => new Set([
  ...d.phase.split('/').map((p) => /^ticket-(\d+)$/.exec(p)?.[1]).filter(Boolean).map(Number),
  ...[...d.decision.matchAll(/#(\d+)\b/g)].map((m) => Number(m[1])),
]);

// The number of a ticket node, `issue:<n>`; null for any other node id.
export const issueNumber = (id) => (id.startsWith('issue:') ? Number(id.slice('issue:'.length)) : null);

// Whether `text` names `path` as a whole path, not as part of a longer one; a folder (`dir/`) is
// named by any path inside it too. Shared by the provenance overlay (a check naming a file) and the
// causal order (a row naming a file an agent wrote).
export function namesPath(text, path) {
  for (let i = text.indexOf(path); i >= 0; i = text.indexOf(path, i + 1)) {
    if (!/[\w./-]/.test(text[i - 1] ?? ' ') && (path.endsWith('/') || !/[\w/-]/.test(text[i + path.length] ?? ' '))) return true;
  }
  return false;
}

// Whether a row's phase is ticket n's: a `ticket-<n>` segment, or a `#<n>` anywhere in it. A failed
// check of ticket n attacks the rows of its phase (graph/assurance.mjs).
export const inTicketPhase = (d, n) =>
  d.phase.split('/').some((p) => p === `ticket-${n}`) || new RegExp(`#${n}(?!\\d)`).test(d.phase);
