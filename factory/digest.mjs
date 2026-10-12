#!/usr/bin/env node
// The digest: the orchestrator's reads of the node model at the moments it acts (spec #52,
// stories 29, 39, 42 and 43). It reads the stream, builds the graph (graph.mjs) and prints a small
// answer: one line when there is nothing to report, at most 15 lines otherwise, the last of them
// `+N more: <command>` when cut (capRead, reads.mjs). It only reports; it never stops,
// re-dispatches, closes or writes.
//
//   npm run digest -- dispatch <ticket> [--all] [--root <repo>]
//       the standing decisions that bind the ticket, for the worker's prompt
//   npm run digest -- frontier <spec> [--all] [--root <repo>]
//       the zero-slack tickets, starts before a blocker merged that no decision row explains, and
//       in the spec's runs the hand-backs nobody acted on and the orphaned or doubled stops
//   npm run digest -- done <spec> [--all] [--root <repo>]
//       the residual doubt: stories with no passing evidence, open challenges, undec rows, and
//       whether the run completed properly
import { cli, UsageError } from './cli.mjs';
import { buildGraph } from './graph.mjs';
import { defaultRoot, ticketNumber } from './log.mjs';
import { readStream } from './read.mjs';
import { capRead, cut, gist, mergeCommits, plural, storyEvidence } from './reads.mjs';

// The dispatch moment: which standing decisions bind ticket n.
function dispatchRead(graph, n, all = false) {
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
  return capRead(`dispatch #${n}: ${plural(bound.length, 'standing decision')} bind${bound.length === 1 ? 's' : ''} it`, items, `npm run digest -- dispatch ${n} --all`, all);
}

// The frontier moment of spec n: the zero-slack tickets, each start before a blocker's merge commit
// that no standing row explains, and, over the agents of the spec's runs, the hand-backs nothing
// acted on (graph/causal.mjs; ISSUES and BLOCKED first) and each orphaned or doubled stop. What
// is ready to start stays with `npm run frontier`.
function frontierRead(graph, n, all = false) {
  if (graph.spec !== n) return [`frontier #${n}: no ticket-graph snapshot of spec #${n}; run npm run frontier -- ${n} first`];
  const slack = graph.slack();
  const zero = slack.filter((s) => s.slack === 0);
  const path = `zero slack (critical path of ${Math.max(0, ...zero.map((s) => s.earliest + 1))}): ${zero.map((s) => `#${s.ticket}`).join(' ')}`;
  const early = graph.earlyStarts().filter((e) => !e.explainedBy.length);
  const unacted = graph.unacted(n);
  const stops = graph.lifecycle(n);
  const open = slack.length ? plural(slack.length, 'open ticket') : 'every ticket merged';
  if (!early.length && !unacted.length && !stops.length) {
    return [cut(`frontier #${n}: ${open}; no early start, hand-back or stop to flag${slack.length ? `; ${path}` : ''}`)];
  }
  const items = [
    ...(slack.length ? [cut(`  ${path}`)] : []),
    ...early.map((e) => cut(`  early start #${e.ticket}: started at ${e.start}, before #${e.blocker} ${e.merged ? `merged (${e.merged})` : 'merged (not yet)'}`)),
    ...unacted.map((h) => cut(`  ${h.id} ${h.status}, ${h.role ?? 'unknown'} #${h.ticket ?? '-'}${gist(h.report) ? `: ${gist(h.report)}` : ''}`)),
    ...stops.map((p) => cut(`  ${p.id} ${p.kind} of agent ${p.agent}`)),
  ];
  const head = [
    `frontier #${n}: ${open}${slack.length ? `, ${zero.length} with zero slack` : ''}`,
    ...(early.length ? [plural(early.length, 'undocumented early start')] : []),
    ...(unacted.length ? [`${plural(unacted.length, 'hand-back')} not acted on`] : []),
    ...(stops.length ? [plural(stops.length, 'orphaned or doubled stop')] : []),
  ].join(', ');
  return capRead(cut(head), items, `npm run digest -- frontier ${n} --all`, all);
}

// The done moment of spec n: the residual doubt (graph/assurance.mjs), counted, never multiplied.
// One line when every story has passing evidence, no challenge is open, no row is undec and the run
// completed properly.
function doneRead(graph, n, all = false) {
  if (graph.spec !== n) return [`done #${n}: no ticket-graph snapshot of spec #${n}; run npm run frontier -- ${n} first`];
  const d = graph.done(n);
  const total = graph.goals().length;
  const some = (k, one) => (k ? plural(k, one) : `no ${one}`);
  const ended = d.completion.proper ? 'the run completed properly' : 'the run did not complete properly';
  const stories = d.goals.length ? `${d.goals.length} of ${total} stories without passing evidence` : total ? `all ${total} stories have passing evidence` : 'no story known';
  const head = `done #${n}: residual doubt ${d.residual}: ${stories}, ${some(d.challenges.length, 'open challenge')}, ${some(d.undec.length, 'undec row')}, ${ended}`;
  const of = (status) => d.goals.filter((g) => g.status === status).map((g) => g.story).join(' ');
  const named = new Set(d.goals.flatMap((g) => g.doubts));
  const { unmerged, gates } = d.completion;
  const items = [
    ...(d.listed ? [] : [`  story list: not in the snapshot; run npm run frontier -- ${n} so a story missing from the map shows`]),
    ...(of('undeveloped') ? [`  undeveloped (no story-map row): ${of('undeveloped')}`] : []),
    ...(of('none') ? [`  no evidence (none row): ${of('none')}`] : []),
    ...(of('unrun') ? [`  evidence never run: ${of('unrun')}`] : []),
    ...d.goals.filter((g) => g.status === 'failing').map((g) => cut(`  story ${g.story} failing: ${[
      ...g.evidence.filter((e) => e.result === 'fail').map((e) => `${e.kind} ${e.name} fail (${e.at})`),
      ...g.doubts.filter((id) => !g.evidence.some((e) => e.at && id.startsWith(e.at))).map((id) => `challenge ${id}`),
    ].join(', ')}`)),
    ...d.challenges.filter((c) => !named.has(c.id)).map((c) => cut(`  ${c.id} ${c.kind} ${c.source}${c.target ? ` on ${c.target}` : ''}: ${gist(c.why)}`)),
    ...d.undec.map((r) => cut(`  undec row:${r.line}: ${r.text}`)),
    ...(d.completion.proper ? [] : [cut(`  not complete: ${[
      ...(unmerged.length ? [`unmerged ${unmerged.map((t) => `#${t}`).join(' ')}`] : []),
      ...gates.flatMap((g) => [...g.tokens.map((b) => `#${g.ticket} never started after #${b} merged`), ...g.owed.map((b) => `#${g.ticket} started but #${b} never merged`)]),
    ].join('; ')}`)]),
  ];
  return capRead(head, items, `npm run digest -- done ${n} --all`, all);
}

// Each moment's read, and the ticket-graph snapshot it reads: the stream's latest for dispatch,
// the latest of the spec for frontier and done.
const MOMENTS = {
  dispatch: { read: dispatchRead, of: () => true },
  frontier: { read: frontierRead, of: (e, n) => e.spec === n },
  done: { read: doneRead, of: (e, n) => e.spec === n },
};

cli(import.meta.url, {
  usage: 'node factory/digest.mjs dispatch <ticket> | frontier <spec> | done <spec> [--all] [--root <repo>]',
  options: { all: 'flag', root: 'string' },
  positionals: true,
}, ({ positionals: [moment, issue, ...extra], all, root = defaultRoot() }) => {
  if (!Object.hasOwn(MOMENTS, moment ?? '')) throw new UsageError(moment ? `unknown moment: ${moment}` : 'missing moment');
  if (!issue) throw new UsageError('missing issue number');
  let n;
  try {
    n = ticketNumber(issue); // a ticket for dispatch, the spec for frontier and done
  } catch {
    throw new UsageError(`not an issue number: ${issue}`);
  }
  if (extra.length) throw new UsageError(`unexpected argument: ${extra[0]}`);
  const events = readStream(root);
  const snapshot = events.findLast((e) => e.type === 'ticket.graph' && MOMENTS[moment].of(e, n));
  const graph = buildGraph(events, snapshot ? { ...snapshot, merges: mergeCommits(root), ...storyEvidence(root, events, snapshot.spec) } : null);
  process.stdout.write(MOMENTS[moment].read(graph, n, all).join('\n') + '\n');
});
