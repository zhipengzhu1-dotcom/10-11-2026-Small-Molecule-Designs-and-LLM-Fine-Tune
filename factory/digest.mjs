#!/usr/bin/env node
// The digest: the orchestrator's reads of the node model at the moments it acts (spec #52,
// stories 29, 39, 42 and 43). It reads the stream, builds the graph (graph.mjs) and prints a small
// answer: one line when there is nothing to report, at most LIMIT lines otherwise, the last of them
// `+N more: <command>` when cut. It only reports; it never stops, re-dispatches, closes or writes.
//
//   npm run digest -- dispatch <ticket> [--all] [--root <repo>]
//       the standing decisions that bind the ticket, for the worker's prompt
import { cli, UsageError } from './cli.mjs';
import { buildGraph } from './graph.mjs';
import { defaultRoot } from './log.mjs';
import { readStream } from './read.mjs';

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

const MOMENTS = { dispatch: dispatchRead };

cli(import.meta.url, {
  usage: 'node factory/digest.mjs dispatch <ticket> [--all] [--root <repo>]',
  options: { all: 'flag', root: 'string' },
  positionals: true,
}, ({ positionals: [moment, ticket, ...extra], all, root = defaultRoot() }) => {
  if (!Object.hasOwn(MOMENTS, moment ?? '')) throw new UsageError(moment ? `unknown moment: ${moment}` : 'missing moment');
  const n = /^#?([1-9]\d*)$/.exec(ticket ?? '')?.[1];
  if (!n) throw new UsageError(ticket ? `not a ticket number: ${ticket}` : 'missing ticket number');
  if (extra.length) throw new UsageError(`unexpected argument: ${extra[0]}`);
  const lines = MOMENTS[moment](buildGraph(readStream(root)), Number(n), all);
  process.stdout.write(lines.join('\n') + '\n');
});
