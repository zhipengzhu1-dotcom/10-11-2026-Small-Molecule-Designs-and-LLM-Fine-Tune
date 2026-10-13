// The workflow net's sojourn-time alarm (spec #52, story 33; issue #68), an overlay of the node
// model (factory/graph.mjs) kept in its own file. Pure, like the graph module.
//
// A sojourn is one agent.start to the next agent.stop of the same agent in the same run, so a
// resumed agent has one sojourn per resume. An agent's role and ticket are its dispatch's
// (factory/hooks/dispatch.mjs), never agent.start's role, which is the subagent type and nearly
// always `general-purpose`: pooling every agent under it raised the false alarms the process-mining
// research found (research/process-mining:research/orchestration/process-mining.md, section 4.3).
// An agent with no dispatch has no role, so it is never flagged and is no one's history.
//
// A running agent is overdue once its elapsed time passes mean + KAPPA sd of its role's completed
// sojourns in other runs (Stertz's rule for a task still running, as that section adopts). A role
// with fewer than MIN_HISTORY such sojourns raises no alarm.
import { dispatchesOf } from './scope.mjs';

const KAPPA = 2;
const MIN_HISTORY = 2;

// Running agents past their role's bound, most overdue first: [{ agent, run, role, ticket, since,
// elapsed, bound, mean, sd, n }], times in ms. `now` is ms since the epoch; `run`, when given,
// limits the answer to that run's agents.
export function overdue(events, now, { run } = {}) {
  const roles = new Map(); // agent -> { role, ticket } of its last dispatch with a known role
  for (const [agent, ds] of dispatchesOf(events.map((e) => ({ e })))) {
    const d = ds.findLast((x) => x.e.role && x.e.role !== 'unknown')?.e;
    if (d) roles.set(agent, { role: d.role, ticket: d.ticket });
  }
  const done = [];
  const open = new Map(); // `<run>/<agent>` -> its open agent.start
  for (const e of events) {
    const key = `${e.run}/${e.agent}`;
    if (e.type === 'agent.start') open.set(key, e);
    if (e.type === 'agent.stop' && open.has(key)) {
      done.push({ run: e.run, agent: e.agent, ms: Date.parse(e.ts) - Date.parse(open.get(key).ts) });
      open.delete(key);
    }
  }
  const out = [];
  for (const start of open.values()) {
    const who = roles.get(start.agent);
    if (!who || (run !== undefined && start.run !== run)) continue;
    const past = done.filter((s) => s.run !== start.run && roles.get(s.agent)?.role === who.role).map((s) => s.ms);
    if (past.length < MIN_HISTORY) continue;
    const mean = past.reduce((a, b) => a + b, 0) / past.length;
    const sd = Math.sqrt(past.reduce((a, b) => a + (b - mean) ** 2, 0) / (past.length - 1));
    const bound = mean + KAPPA * sd;
    const elapsed = now - Date.parse(start.ts);
    if (elapsed > bound) {
      out.push({ agent: start.agent, run: start.run, role: who.role, ticket: who.ticket, since: start.ts, elapsed, bound, mean, sd, n: past.length });
    }
  }
  return out.sort((a, b) => b.elapsed / b.bound - a.elapsed / a.bound);
}
