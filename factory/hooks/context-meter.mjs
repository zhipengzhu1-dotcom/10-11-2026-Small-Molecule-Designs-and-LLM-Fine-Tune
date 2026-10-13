#!/usr/bin/env node
// Claude Code UserPromptSubmit / PostToolUse hook: the context meter. In the orchestrated run
// (the session the run marker names, factory/run-marker.mjs) it injects one line with the
// session's current context size, read from its transcript (factory/transcript.mjs), so the
// orchestrator's budget check runs on a number instead of a guess. Other sessions, and tool
// calls inside subagents, get nothing.
//
// It also asks the node model's sojourn query (factory/graph/sojourn.mjs, graph.overdue) for this
// run's overdue agents, those running past their role's usual time (spec #52, stories 33 and 41),
// and adds one line naming them only when there are any: a stuck last agent never hands back, so
// nothing else would show it. It runs on every prompt and tool call, so it asks the query on the
// events directly instead of building the whole graph.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { overdue } from '../graph/sojourn.mjs';
import { defaultRoot, safeId } from '../log.mjs';
import { readStream } from '../read.mjs';
import { inMarkedRun } from '../run-marker.mjs';
import { contextTokens } from '../transcript.mjs';

function meterLine(transcriptPath) {
  let tokens;
  try {
    tokens = contextTokens(transcriptPath.replace(/^~(?=[\\/])/, homedir()));
  } catch {
    return undefined; // no transcript yet
  }
  return tokens == null ? undefined : `Context meter: ${tokens.toLocaleString('en-US')} tokens in context (latest main-thread reply).`;
}

const span = (ms) => {
  const m = Math.round(ms / 60000);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}m`;
};

// One line for every overdue agent of the run, or undefined when there is none. A stream the
// reader rejects is named instead, since the check can't run on it.
function overdueLine(root, run) {
  let late;
  try {
    late = overdue(readStream(root), Date.now(), { run });
  } catch (err) {
    return `Overdue check failed: ${err.message}`;
  }
  if (!late.length) return undefined;
  const one = (o) => `${o.agent} (${o.role} #${o.ticket ?? '-'}) running ${span(o.elapsed)}, past its role's bound of ${span(o.bound)} (${o.n} earlier sojourns)`;
  return `Overdue: ${late.map(one).join('; ')}.`;
}

function main() {
  const payload = JSON.parse(readFileSync(0, 'utf8'));
  // A subagent's tool calls carry its agent_id; the orchestrator's own never do.
  if (payload.agent_id || !payload.session_id || !payload.transcript_path) return;
  const root = defaultRoot();
  if (!inMarkedRun(root, payload.session_id)) return;
  const lines = [meterLine(payload.transcript_path), overdueLine(root, safeId(payload.session_id))].filter(Boolean);
  if (!lines.length) return;
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: payload.hook_event_name, additionalContext: lines.join('\n') },
  }));
}

try {
  main();
} catch (err) {
  // Exit 1 is a non-blocking hook error: Claude Code shows it and the session goes on.
  process.stderr.write(`factory/hooks/context-meter.mjs: ${err.message}\n`);
  process.exit(1);
}
