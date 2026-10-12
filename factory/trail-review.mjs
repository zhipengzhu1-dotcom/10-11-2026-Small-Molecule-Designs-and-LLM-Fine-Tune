// The trail review by per-pair judging (issue #65; spec #52, "Text and judge"): each reviewed row
// against its K nearest earlier rows that still stand (TF-IDF, graph.similar), one judge call per
// pair. It replaces the single whole-log call, which no judge under the 8 GB cap could use to find
// the log's two unrecorded supersessions (41→43, 21→71); qwen3.5:4b finds both when shown the pair
// (research/local-models). It is a sanity check, never a gate.
//
//   await trailReview({ graph, lines, judge, k }) -> { judged, flags }
//       lines   the decision rows to review (the audited rows of one session)
//       judge   (earlier, later) -> { verdict, why }, judge.mjs's createJudge() or a fake
//       flags   [{ earlier, later, score, verdict, why }], every pair the judge did not call
//               `consistent` that the later row does not already mark
//   reviewText({ session, lines, model, judged, flags }) -> the review file, under the
//       "reviewed by <model>" line the trail check reads
//
// A row that is out replaces nothing, so it is not reviewed. A pair the later row marks
// (supersedes, withdraws, corrects) is judged like any other and dropped after, as in the precedent
// check: a `corrects` pair is never named in the judge's prompt. A judge that throws stops the
// review, so a review is never written from half the pairs.
const K = 3;
const fixed = (s) => s.toFixed(2);

export async function trailReview({ graph, lines, judge, k = K }) {
  const flags = [];
  let judged = 0;
  for (const line of lines) {
    const later = graph.decision(line);
    if (!later || later.label === 'out') continue;
    const earlierStanding = (id) => {
      const n = graph.node(id);
      return n?.type === 'decision' && n.event.line < line && graph.decision(n.event.line).label === 'in';
    };
    for (const { id, score } of graph.similar(`row:${line}`, { k, among: earlierStanding })) {
      const earlier = graph.decision(graph.node(id).event.line);
      let answer;
      try {
        answer = await judge({ line: earlier.line, text: earlier.text, why: earlier.why }, { line, text: later.text, why: later.why });
      } catch (err) {
        throw new Error(`${judge.model ?? 'the judge'}: ${err.message} (judging row:${earlier.line} → row:${line})`);
      }
      judged += 1;
      const marked = later.relations.some((r) => r.line === earlier.line && r.kind !== 'closes');
      if (answer.verdict !== 'consistent' && !marked) flags.push({ earlier, later, score, verdict: answer.verdict, why: answer.why });
    }
  }
  return { judged, flags };
}

// "2-8" for a run of consecutive lines, else the lines comma-separated.
function rowList(lines) {
  const sorted = [...lines].sort((a, b) => a - b);
  const run = sorted.length > 2 && sorted.every((l, i) => i === 0 || l === sorted[i - 1] + 1);
  return run ? `${sorted[0]}-${sorted.at(-1)}` : sorted.join(', ');
}

export function reviewText({ session, lines, model, judged, flags }) {
  const pairs = `${judged} pair${judged === 1 ? '' : 's'} judged`;
  return [
    `# Trail review, run ${session.slice(0, 8)}`,
    '',
    `reviewed by ${model}`,
    '',
    `Per-pair review of decision-log rows ${rowList(lines)}, by \`npm run audit -- review\`: each row that still stands against `
      + `its ${K} nearest earlier rows that still stand (TF-IDF), one ${model} call per pair, thinking off. A pair the later row `
      + 'already marks (supersedes, withdraws, corrects) is dropped after the judge. It is a sanity check, not a gate: the scripted '
      + 'checks carry the weight.',
    '',
    '## Flags',
    '',
    flags.length ? `${flags.length} of the ${pairs} ${flags.length === 1 ? 'is' : 'are'} flagged.` : `No flags: none of the ${pairs} contradicts.`,
    ...(flags.length ? [''] : []),
    ...flags.flatMap((f) => [
      `- row:${f.earlier.line} → row:${f.later.line} (${fixed(f.score)}) ${f.verdict}: ${f.why}`,
      `  - row:${f.earlier.line}: ${f.earlier.text}`,
      `  - row:${f.later.line}: ${f.later.text}`,
    ]),
    '',
  ].join('\n');
}
