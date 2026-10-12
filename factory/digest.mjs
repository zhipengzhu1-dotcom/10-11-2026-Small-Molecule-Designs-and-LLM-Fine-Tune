#!/usr/bin/env node
// The digest: the orchestrator's reads of the node model at the moments it acts (spec #52,
// stories 29, 39, 42 and 43). It reads the stream, builds the graph (graph.mjs) and prints a small
// answer: one line when there is nothing to report, at most LIMIT lines otherwise, the last of them
// `+N more: <command>` when cut. It only reports; it never stops, re-dispatches, closes or writes.
//
//   npm run digest -- dispatch <ticket> [--all] [--root <repo>]
//       the standing decisions that bind the ticket, for the worker's prompt
//   npm run digest -- frontier <spec> [--all] [--root <repo>]
//       the zero-slack tickets, and starts before a blocker merged that no decision row explains
import { cli, UsageError } from './cli.mjs';
import { gitRun } from './git.mjs';
import { buildGraph } from './graph.mjs';
import { defaultRoot } from './log.mjs';
import { readStream } from './read.mjs';
import { readMarker } from './run-marker.mjs';

export const LIMIT = 15;
const WIDTH = 120;

// A read: its head line, then its items, cut so the whole stays within LIMIT lines, the last of
// them naming `command`, which prints them all. `all` skips the cut.
export function capRead(head, items, command, all = false) {
  if (all || items.length <= LIMIT - 1) return [head, ...items];
  const shown = items.slice(0, LIMIT - 2);
  return [head, ...shown, `+${items.length - shown.length} more: ${command}`];
}

const cut = (line) => (line.length > WIDTH ? `${line.slice(0, WIDTH - 1)}…` : line);

// The dispatch moment: which standing decisions bind ticket n.
export function dispatchRead(graph, n, all = false) {
  const bound = graph.binding(n);
  if (!bound.length) {
    const count = (l) => graph.decisions.filter((d) => d.label === l).length;
    return [`dispatch #${n}: no standing decision binds it (${graph.decisions.length} rows: ${count('in')} in, ${count('out')} out, ${count('undec')} undec)`];
  }
  const items = bound.map(({ row, because }) => {
    const out = row.parts.filter((p) => p.label !== 'in').map((p) => `row:${p.by}`);
    const tags = [because, ...(because === 'given' ? [] : [row.state]), ...(out.length ? [`part out (${out.join(', ')})`] : [])];
    return cut(`  row:${row.line} ${tags.join(', ')}: ${row.text}`);
  });
  const s = bound.length === 1 ? '' : 's';
  return capRead(`dispatch #${n}: ${bound.length} standing decision${s} bind${s ? '' : 's'} it`, items, `npm run digest -- dispatch ${n} --all`, all);
}

// The frontier moment of spec n: the zero-slack tickets, and each start before a blocker's merge
// commit that no standing row explains. What is ready to start stays with `npm run frontier`.
export function frontierRead(graph, n, all = false) {
  if (graph.spec !== n) return [`frontier #${n}: no ticket-graph snapshot of spec #${n}; run npm run frontier -- ${n} first`];
  const slack = graph.slack();
  const zero = slack.filter((s) => s.slack === 0);
  const path = `zero slack (critical path of ${Math.max(0, ...zero.map((s) => s.earliest + 1))}): ${zero.map((s) => `#${s.ticket}`).join(' ')}`;
  const early = graph.earlyStarts().filter((e) => !e.explainedBy.length);
  const open = slack.length ? `${slack.length} open ticket${slack.length === 1 ? '' : 's'}` : 'every ticket merged';
  if (!early.length) return [cut(`frontier #${n}: ${open}${slack.length ? `; ${path}` : ''}; no undocumented early start`)];
  const items = early.map((e) => cut(`  early start #${e.ticket}: started at ${e.start}, before #${e.blocker} ${e.merged ? `merged (${e.merged})` : 'merged (not yet)'}`));
  const s = early.length === 1 ? '' : 's';
  const head = `frontier #${n}: ${open}${slack.length ? `, ${zero.length} with zero slack` : ''}, ${early.length} undocumented early start${s}`;
  return capRead(head, [...(slack.length ? [cut(`  ${path}`)] : []), ...items], `npm run digest -- frontier ${n} --all`, all);
}

// The integration branch's merges as [{ ticket, ts, commit }]: each `Merge #<n>` commit reachable
// from the run marker's branch (HEAD with no run marked), at its commit time. A ticket counts as
// merged by this commit, not by GitHub's state (decision row 100). Outside a git repo, none.
export function mergeCommits(root) {
  const r = gitRun(root, 'log', '--merges', '--format=%H%x09%cI%x09%s', readMarker(root)?.branch ?? 'HEAD');
  if (r.status !== 0) return [];
  return r.stdout.split('\n').flatMap((line) => {
    const [commit, date, subject] = line.split('\t');
    const ticket = /^Merge #(\d+)\b/.exec(subject ?? '')?.[1];
    return ticket ? [{ ticket: Number(ticket), ts: new Date(date).toISOString().replace('.000Z', 'Z'), commit }] : [];
  });
}

// Each moment's read, and the ticket-graph snapshot it reads: the stream's latest for dispatch,
// the latest of the spec for frontier.
const MOMENTS = {
  dispatch: { read: dispatchRead, of: () => true },
  frontier: { read: frontierRead, of: (e, n) => e.spec === n },
};

cli(import.meta.url, {
  usage: 'node factory/digest.mjs dispatch <ticket> | frontier <spec> [--all] [--root <repo>]',
  options: { all: 'flag', root: 'string' },
  positionals: true,
}, ({ positionals: [moment, ticket, ...extra], all, root = defaultRoot() }) => {
  if (!Object.hasOwn(MOMENTS, moment ?? '')) throw new UsageError(moment ? `unknown moment: ${moment}` : 'missing moment');
  const n = Number(/^#?([1-9]\d*)$/.exec(ticket ?? '')?.[1]);
  if (!n) throw new UsageError(ticket ? `not an issue number: ${ticket}` : 'missing issue number');
  if (extra.length) throw new UsageError(`unexpected argument: ${extra[0]}`);
  const events = readStream(root);
  const snapshot = events.findLast((e) => e.type === 'ticket.graph' && MOMENTS[moment].of(e, n));
  const graph = buildGraph(events, snapshot ? { ...snapshot, merges: mergeCommits(root) } : null);
  process.stdout.write(MOMENTS[moment].read(graph, n, all).join('\n') + '\n');
});
