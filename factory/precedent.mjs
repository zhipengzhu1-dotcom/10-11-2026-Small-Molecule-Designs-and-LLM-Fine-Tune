// The precedent check (spec #52, stories 34 and 45; issue #64): before a decision row is written,
// the earlier rows it may replace or reverse. It takes the K nearest rows that still stand (TF-IDF,
// graph.precedents), has the judge rule on each pair, then drops the pairs the new row already
// marks. A `corrects` pair is dropped here, after the judge, never named in its prompt. It only
// reports; `npm run decide` prints it and writes the row whatever it says.
//
//   await precedentRead({ graph, decision, why, relations, judge, k }) -> lines
//       decision, why  the new row's decision (without its relation phrase) and why cells
//       relations      the new row's row relations, [{ kind, line, part }] (claim.mjs)
//       judge          (earlier, later) -> { verdict, why }, judge.mjs's createJudge() or a fake
//
// Lines: one when clean or when no standing row is like it; otherwise a head line and, per flagged
// row, the row and the judge's reason. A judge that throws stops the check, which then lists the
// rows unjudged.
const K = 3;
const WIDTH = 120;
const cut = (line) => (line.length > WIDTH ? `${line.slice(0, WIDTH - 1)}…` : line);
const fixed = (s) => s.toFixed(2);

export async function precedentRead({ graph, decision, why, relations = [], judge, k = K }) {
  const found = graph.precedents(`${decision}\n${why ?? ''}`, k);
  if (!found.length) return ['precedent: no earlier standing row is like this one'];
  const later = { text: decision, why };
  const judged = [];
  for (const { row, score } of found) {
    try {
      judged.push({ row, score, ...(await judge({ line: row.line, text: row.text, why: row.why }, later)) });
    } catch (err) {
      const where = [judge.model, judge.host].filter(Boolean).join(' at ');
      return [
        `precedent: judge unreachable (${where ? `${where}: ` : ''}${err.message}); the ${found.length} nearest standing row${found.length === 1 ? '' : 's'}, unjudged:`,
        ...found.map((f) => cut(`  row:${f.row.line} ${fixed(f.score)}: ${f.row.text}`)),
      ];
    }
  }
  const marked = (row) => relations.find((r) => r.line === row.line)?.kind;
  const flagged = judged.filter((j) => j.verdict !== 'consistent' && !marked(j.row));
  const n = found.length;
  if (!flagged.length) {
    const list = judged.map((j) => `row:${j.row.line} ${fixed(j.score)}${marked(j.row) ? ` (${marked(j.row)})` : ''}`).join(', ');
    return [`precedent: no contradiction among the ${n} nearest standing row${n === 1 ? '' : 's'} (${list}; judged by ${judge.model ?? 'the judge'})`];
  }
  const it = flagged.length === 1 ? 'it' : 'each';
  return [
    `precedent: ${flagged.length} of the ${n} nearest standing row${n === 1 ? '' : 's'} may be replaced or reversed by this row; mark ${it} with --supersedes, --withdraws or --corrects, or let it stand`,
    ...flagged.flatMap((j) => [cut(`  row:${j.row.line} ${fixed(j.score)} ${j.verdict}: ${j.row.text}`), cut(`    judge: ${j.why}`)]),
  ];
}
