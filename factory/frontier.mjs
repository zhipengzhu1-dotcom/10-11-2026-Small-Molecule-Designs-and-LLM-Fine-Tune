#!/usr/bin/env node
// The ticket frontier of a spec or map issue: one GitHub GraphQL query for every child's state,
// labels, assignees, sub-issues and blockers (GitHub's native issue dependencies).
//
//   npm run frontier -- <map issue number> [--json]
//
// Each child gets one status, in this order of precedence:
//   closed     the child is closed
//   spec       it has sub-issues of its own, so it is a spec or map, never a ticket
//   blocked    an issue that blocks it is still open (listed after "by")
//   assigned   someone has claimed it
//   ready      labelled ready-for-agent: the frontier
//   human      labelled ready-for-human
//   not-ready  anything else (needs-triage, needs-info, no label)
// The frontier is the ready children, in map order. Needs `gh` logged in.
//
// During an orchestrated run (the run marker in the factory root names one), each call also
// writes a `ticket.graph` snapshot event under that run, as agent orchestrator (issue #59).
// With no run marked it writes nothing.
import { spawnSync } from 'node:child_process';
import { cli, UsageError } from './cli.mjs';
import { git } from './git.mjs';
import { defaultRoot, writeEvent } from './log.mjs';
import { readMarker } from './run-marker.mjs';

const QUERY = `query($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    issue(number: $number) {
      body
      subIssues(first: 100) {
        nodes {
          number title state
          labels(first: 20) { nodes { name } }
          assignees(first: 10) { nodes { login } }
          subIssues { totalCount }
          blockedBy(first: 50) { nodes { number state } }
        }
      }
    }
  }
}`;

export function repoOf(remote) {
  const m = /github\.com[:/]([^/]+)\/(.+?)(?:\.git)?\/?$/.exec(remote.trim());
  if (!m) throw new Error(`not a GitHub remote: ${remote}`);
  return { owner: m[1], repo: m[2] };
}

function statusOf(c) {
  if (c.state !== 'OPEN') return 'closed';
  if (c.subIssues) return 'spec';
  if (c.openBlockers.length) return 'blocked';
  if (c.assignees.length) return 'assigned';
  if (c.labels.includes('ready-for-agent')) return 'ready';
  if (c.labels.includes('ready-for-human')) return 'human';
  return 'not-ready';
}

// gh(args) runs the gh CLI and returns its stdout. With a factory root whose run marker names an
// orchestrated run, it also writes one `ticket.graph` event as the orchestrator: each child's
// title (the ticket's text node, graph/text.mjs), state, status and open blockers, and the spec's
// user stories (`stories`, when it lists any), so
// the graph can be rebuilt from the logs without GitHub.
export function frontier({ number, remote, gh, root }) {
  const { owner, repo } = repoOf(remote);
  const out = gh(['api', 'graphql', '-f', `query=${QUERY}`, '-f', `owner=${owner}`, '-f', `repo=${repo}`, '-F', `number=${number}`]);
  const issue = JSON.parse(out).data?.repository?.issue;
  if (!issue) throw new Error(`no issue #${number} in ${owner}/${repo}`);
  const children = issue.subIssues.nodes.map((n) => {
    const c = {
      number: n.number,
      title: n.title,
      state: n.state,
      labels: n.labels.nodes.map((l) => l.name),
      assignees: n.assignees.nodes.map((a) => a.login),
      subIssues: n.subIssues.totalCount,
      openBlockers: n.blockedBy.nodes.filter((b) => b.state === 'OPEN').map((b) => b.number),
    };
    return { ...c, status: statusOf(c) };
  });
  const run = root && readMarker(root)?.run;
  if (run) {
    const tickets = children.map((c) => ({ number: c.number, title: c.title, state: c.state, status: c.status, blockers: c.openBlockers }));
    const stories = userStories(issue.body ?? '');
    writeEvent({ root, run, agent: 'orchestrator', type: 'ticket.graph', fields: { spec: number, tickets, ...(stories.length ? { stories } : {}) } });
  }
  return { children, ready: children.filter((c) => c.status === 'ready').map((c) => c.number) };
}

// The spec's user stories: the numbers of the numbered items under its `## User Stories` heading,
// up to the next `## ` heading (its `### ` groups stay inside), for the assurance case's goals.
function userStories(body) {
  const lines = body.split(/\r?\n/);
  const start = lines.findIndex((l) => /^##\s+User Stories\s*$/i.test(l));
  if (start < 0) return [];
  const end = lines.findIndex((l, i) => i > start && /^##\s/.test(l));
  return lines.slice(start + 1, end < 0 ? undefined : end).flatMap((l) => /^(\d+)\.\s/.exec(l)?.[1] ?? []).map(Number);
}

function gh(args) {
  const r = spawnSync('gh', args, { encoding: 'utf8', maxBuffer: 16 << 20 });
  if (r.error || r.status !== 0) throw new Error(`gh ${args[0]} failed: ${r.error?.message ?? r.stderr.trim()}`);
  return r.stdout;
}

cli(import.meta.url, {
  usage: 'node factory/frontier.mjs <map issue number> [--json]',
  options: { json: 'flag' },
  positionals: true,
}, ({ positionals: [number, ...extra], json }) => {
  if (!/^[1-9]\d*$/.test(number ?? '')) throw new UsageError(number ? `not an issue number: ${number}` : 'missing map issue number');
  if (extra.length) throw new UsageError(`unexpected argument: ${extra[0]}`);
  const remote = git('.', 'remote', 'get-url', 'origin');
  const result = frontier({ number: Number(number), remote, gh, root: defaultRoot() });
  if (json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  for (const c of result.children) {
    const status = c.status === 'blocked' ? `blocked by ${c.openBlockers.map((b) => `#${b}`).join(' ')}` : c.status;
    process.stdout.write(`#${c.number}\t${status}\t[${c.labels.join(', ')}]\t${c.title}\n`);
  }
  process.stdout.write(`frontier: ${result.ready.map((n) => `#${n}`).join(' ') || 'none'}\n`);
});
