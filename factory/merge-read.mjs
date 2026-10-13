// The merge read (spec #52, stories 35, 36 and 40; issue #69): before a merge, what would make it
// unsafe. `npm run merge` prints it before it merges and merges whatever it says: it only reports.
//
//   await mergeRead({ graph, branch, paths, ticket, agents, judge, all }) -> lines
//       paths   the files the branch changes, repo-relative; the provenance lines keep to them
//       ticket  the ticket merged (from `Merge #<n>`), if known
//       agents  agents the branch names (a `worktree-agent-<id>` branch), if any
//       judge   (earlier, later) -> { verdict, why }, judge.mjs's createJudge() or a fake
//
// It lists files two agents wrote and checks that ran before their file's last write (the graph's
// provenance overlay), and the hand-back reports that contradict a standing decision: for each
// agent dispatched for the ticket (or for the ticket of an agent the branch names), its latest
// report, judged against its 3 nearest rows still `in` (graph.precedents), one call per pair. A
// judge that throws stops the judging; the reports are then listed unjudged.
//
// One line when clean; otherwise a head line and an item per finding, cut by capRead to 15 lines,
// the last naming `npm run merge -- <branch> --read --all`.
import { capRead, cut, judgeAt, judged, K, plural } from './reads.mjs';

const REPORT_CAP = 6000; // characters of a report the judge sees: the model's context is small

// The latest hand-back report of each agent that served the ticket or that `agents` names.
function reports(graph, ticket, agents = []) {
  const dispatches = graph.nodes.filter((n) => n.type === 'dispatch' && n.event.to);
  const tickets = new Set(ticket ? [ticket] : []);
  for (const d of dispatches) if (agents.includes(d.event.to) && d.event.ticket) tickets.add(d.event.ticket);
  const who = new Set(agents);
  for (const d of dispatches) if (tickets.has(d.event.ticket)) who.add(d.event.to);
  const latest = new Map();
  for (const n of graph.nodes) if (n.type === 'agent.stop' && n.event.report && who.has(n.event.agent)) latest.set(n.event.agent, n);
  return [...latest.values()];
}

const named = (r) => `report ${r.id} (${r.event.agent}, ${r.event.status ?? 'unknown'})`;

async function contradictions(graph, list, judge) {
  const found = [];
  for (const r of list) {
    const text = r.event.report.slice(0, REPORT_CAP);
    for (const { row } of graph.precedents(r.event.report, K)) {
      const answer = await judge(judged(row), { text, kind: 'report' });
      if (answer.verdict !== 'consistent') found.push({ report: r, row, ...answer });
    }
  }
  return found;
}

export async function mergeRead({ graph, branch, paths, ticket, agents = [], judge, all = false }) {
  const twice = graph.writtenTwice(paths);
  const stale = graph.staleChecks(paths);
  const list = reports(graph, ticket, agents);
  let found = [];
  let unreachable = null;
  try {
    found = await contradictions(graph, list, judge);
  } catch (err) {
    const where = judgeAt(judge);
    unreachable = `${where ? `${where}: ` : ''}${err.message}`;
  }

  const items = [
    ...twice.map((w) => cut(`  written twice: ${w.path}, by ${w.agents.join(' and ')} (${w.writes.join(', ')})`)),
    ...stale.map((s) => cut(`  stale check: ${s.name} (${s.result}, ${s.check}) ran before ${s.path} last changed (${s.write})`)),
    ...found.flatMap((f) => [cut(`  ${named(f.report)} may contradict row:${f.row.line}: ${f.row.text}`), cut(`    judge: ${f.why}`)]),
    ...(unreachable ? [`  judge unreachable (${unreachable}); ${plural(list.length, 'report')} unjudged:`, ...list.map((r) => `    ${named(r)}`)] : []),
  ];
  const head = `merge read ${branch}`;
  if (!items.length) {
    const files = paths ? `${plural(paths.length, 'changed file')}: ` : '';
    const judged = list.length ? `${plural(list.length, 'report')}, no contradiction by ${judge.model ?? 'the judge'}` : 'no hand-back report to judge';
    return [`${head}: clean (${files}none written twice, no stale check; ${judged})`];
  }
  const counts = [
    ...(twice.length ? [`${plural(twice.length, 'file')} written twice`] : []),
    ...(stale.length ? [plural(stale.length, 'stale check')] : []),
    ...(found.length ? [`${plural(new Set(found.map((f) => f.report.id)).size, 'report')} may contradict a standing decision`] : []),
    ...(unreachable ? ['judge unreachable'] : []),
  ];
  return capRead(`${head}: ${counts.join(', ')}`, items, `npm run merge -- ${branch} --read --all`, all);
}
