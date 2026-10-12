// What the orchestrator's reads of the node model share (spec #52, stories 34, 35, 37 and 39): the
// digest (digest.mjs), the precedent check (precedent.mjs), the merge read (merge-read.mjs) and the
// trail review (trail-review.mjs), and the viewer for the story evidence. Not a CLI: the decision
// writer and the merge script make their reads through these modules, not by running the digest.
//
//   capRead(head, items, command, all?)   a read cut to LIMIT lines, the last `+N more: <command>`
//   cut(line)                             a line cut to WIDTH characters
//   plural(n, one, many?)                 "1 row", "3 rows"
//   fixed(score)                          a cosine to two places
//   gist(report)                          a report's first line of substance
//   K                                     how many nearest standing rows the judge sees
//   judged(row)                           a row as the judge takes it, { line, text, why }
//   judgeAt(judge)                        "<model> at <host>", for a judge that could not be reached
//   storyEvidence(root, events, spec)     the story map and test results the assurance overlay reads
//   mergeCommits(root)                    the integration branch's `Merge #<n>` commits
//   mergedTicket(subject)                 the ticket a `Merge #<n>` subject merges, or null
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readMap } from './checks/stories.mjs';
import { gitRun } from './git.mjs';
import { readMarker } from './run-marker.mjs';
import { readResults } from './test-results.mjs';

const LIMIT = 15;
const WIDTH = 120;
export const K = 3;

// A read: its head line, then its items, cut so the whole stays within LIMIT lines, the last of
// them naming `command`, which prints them all. `all` skips the cut.
export function capRead(head, items, command, all = false) {
  if (all || items.length <= LIMIT - 1) return [head, ...items];
  const shown = items.slice(0, LIMIT - 2);
  return [head, ...shown, `+${items.length - shown.length} more: ${command}`];
}

export const cut = (line) => (line.length > WIDTH ? `${line.slice(0, WIDTH - 1)}…` : line);
export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export const fixed = (score) => score.toFixed(2);

// A report's first line of substance: its status word, any parenthesis after it ("ISSUES (2 of
// 3):") and the punctuation that follows are left out.
export const gist = (report) => (report ?? '').split('\n')
  .map((l) => l.replace(/^\s*(PASS|ISSUES|BLOCKED)\b\s*(\([^)]*\))?[\s:.,-]*/, '').trim()).find(Boolean) ?? '';

export const judged = (row) => ({ line: row.line, text: row.text, why: row.why });
export const judgeAt = (judge) => [judge.model, judge.host].filter(Boolean).join(' at ');

// The story map of the spec and every logged test-results file, as the assurance overlay reads them
// from the snapshot: map [{ story, kind, name }], results { <path>: [{ name, result }] }. A file
// that is missing gives none.
export function storyEvidence(root, events, spec) {
  const file = join(root, 'factory', 'stories', `${spec}.tsv`);
  const map = existsSync(file) ? readMap(file).rows.map((r) => ({ story: Number(r.story), kind: r.kind, name: r.name })) : [];
  const results = {};
  for (const e of events) {
    if (e.type !== 'artifact' || e.kind !== 'test-results' || !existsSync(join(root, e.path))) continue;
    results[e.path] = readResults(readFileSync(join(root, e.path), 'utf8'));
  }
  return { map, results };
}

// The ticket a merge commit's subject names: `Merge #<n>: <title>`, as the merger writes it.
export const mergedTicket = (subject) => Number(/^Merge #(\d+)\b/.exec(subject ?? '')?.[1]) || null;

// The integration branch's merges as [{ ticket, ts, commit }]: each `Merge #<n>` commit reachable
// from the run marker's branch (HEAD with no run marked), at its commit time. A ticket counts as
// merged by this commit, not by GitHub's state (decision row 100). Outside a git repo, none.
export function mergeCommits(root) {
  const r = gitRun(root, 'log', '--merges', '--format=%H%x09%cI%x09%s', readMarker(root)?.branch ?? 'HEAD');
  if (r.status !== 0) return [];
  return r.stdout.split('\n').flatMap((line) => {
    const [commit, date, subject] = line.split('\t');
    const ticket = mergedTicket(subject);
    return ticket ? [{ ticket, ts: new Date(date).toISOString().replace('.000Z', 'Z'), commit }] : [];
  });
}
