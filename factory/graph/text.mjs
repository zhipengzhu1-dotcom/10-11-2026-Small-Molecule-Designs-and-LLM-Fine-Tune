// The text overlay of the node model (spec #52, "Text and judge"; issue #64): one sparse TF-IDF
// vector per text node, compared by exact cosine, with no index. At our scale (hundreds of nodes) a
// scan is instant, and the research found no dense embedder that beat it. Pure, like graph.mjs.
//
//   text nodes  row:<N>   the decision (after its relation phrase) and its why
//               event:…   an agent.stop's hand-back report
//               issue:<n> a ticket's title, from the ticket-graph snapshot
//
//   similar(query, { k = 3, among }) -> [{ id, score }]   highest first, score > 0, ties in node
//       order. query is a text node's id, or { text } for text not in the graph (a row about to be
//       written); a node is never its own neighbour. among(id) narrows the candidates.
//   precedents(text, k = 3) -> [{ row, score }]   the k nearest rows still `in` (stories 34, 45)

// Function words that carry no topic. Kept short: TF-IDF already damps common words.
const STOP = new Set(('a an and are as at be been but by can for from had has have he her his i if in into is it its '
  + 'no not of on once only or our she so such than that the their them then there these they this to too was we '
  + 'were what when which while who will with would you').split(' '));

// Lower-cased runs of letters and digits that hold a letter, less a plural s, without stop words.
export function terms(text) {
  const out = [];
  for (const [w] of (text ?? '').toLowerCase().matchAll(/[\p{L}\p{N}]+/gu)) {
    if (STOP.has(w) || !/\p{L}/u.test(w)) continue;
    out.push(w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);
  }
  return out;
}

// The text of each text node of a built graph, in node order.
function texts(graph) {
  const out = [];
  for (const n of graph.nodes) {
    if (n.type === 'decision') {
      const d = graph.decision(n.event.line);
      out.push([n.id, `${d.text}\n${d.why ?? ''}`]);
    } else if (n.type === 'agent.stop' && n.event.report) out.push([n.id, n.event.report]);
    else if (n.type === 'ticket' && n.title) out.push([n.id, n.title]);
  }
  return out;
}

export function textOverlay(graph) {
  const docs = texts(graph).map(([id, text]) => ({ id, counts: countOf(terms(text)) }));
  const df = new Map();
  for (const { counts } of docs) for (const t of counts.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  // Smoothed idf, so a term in every node still counts a little and an unseen one counts most.
  const idf = (t) => Math.log((1 + docs.length) / (1 + (df.get(t) ?? 0))) + 1;
  const vector = (counts) => {
    const v = new Map();
    for (const [t, c] of counts) v.set(t, (1 + Math.log(c)) * idf(t));
    const norm = Math.hypot(...v.values());
    for (const [t, w] of v) v.set(t, w / norm); // no terms, no entries: an empty text matches nothing
    return v;
  };
  const vectors = new Map(docs.map(({ id, counts }) => [id, vector(counts)]));

  const similar = (query, { k = 3, among = () => true } = {}) => {
    const self = typeof query === 'string' ? query : null;
    const q = self ? vectors.get(self) : vector(countOf(terms(query.text)));
    if (!q) throw new Error(`${self} is not a text node`);
    const scored = [];
    for (const [id, v] of vectors) {
      if (id === self || !among(id)) continue;
      let score = 0;
      for (const [t, w] of q) score += w * (v.get(t) ?? 0);
      if (score > 1e-12) scored.push({ id, score });
    }
    return scored.sort((a, b) => b.score - a.score).slice(0, k); // stable: ties keep node order
  };

  const standing = (id) => graph.node(id)?.type === 'decision' && graph.decision(graph.node(id).event.line).label === 'in';
  const precedents = (text, k = 3) => similar({ text }, { k, among: standing })
    .map(({ id, score }) => ({ row: graph.decision(graph.node(id).event.line), score }));

  return { similar, precedents };
}

function countOf(list) {
  const m = new Map();
  for (const t of list) m.set(t, (m.get(t) ?? 0) + 1);
  return m;
}
