#!/usr/bin/env node
// Claude Code PostToolUse hook on Agent and SendMessage (spec #52, stories 1 and 3-7; issue #56).
// In the orchestrated run (the session the run marker names) it writes, into the orchestrator's
// activity file factory/agents/<run>/orchestrator.jsonl:
//   - dispatch, for an Agent launch (`to` = tool_response.agentId), with the role and ticket the
//     description names (factory/description.mjs);
//   - dispatch with resume: true, for a SendMessage that resumed a stopped agent
//     (`to` = resumedAgentId), with the role, ticket and description of that agent's last dispatch;
//   - message, a cause edge, for a SendMessage queued to a still-running agent (no resumedAgentId).
// A failed SendMessage writes nothing. Other sessions, and a subagent's own calls (payload has
// agent_id), write nothing; so does a payload it can't read.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseDescription } from '../description.mjs';
import { activityFile, defaultRoot, safeId, writeEvent } from '../log.mjs';
import { parseTarget } from '../pointer.mjs';
import { inMarkedRun } from '../run-marker.mjs';

const ORCHESTRATOR = 'orchestrator';

// The latest dispatch of agent `to` in any run's orchestrator file: a resume can come in a later
// session than the launch. Lines that don't parse are skipped; this is a lookup, not a reader.
function lastDispatch(root, to) {
  const dir = join(root, 'factory', 'agents');
  if (!existsSync(dir)) return undefined;
  let last;
  for (const run of readdirSync(dir, { withFileTypes: true })) {
    if (!run.isDirectory()) continue;
    const file = activityFile(root, run.name, ORCHESTRATOR);
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      let e;
      try { e = JSON.parse(line); } catch { continue; }
      if (e?.type === 'dispatch' && e.to === to && (!last || Date.parse(e.ts) >= Date.parse(last.ts))) last = e;
    }
  }
  return last;
}

function launchFields(call) {
  const to = call.tool_response?.agentId;
  if (!to) return undefined;
  const description = call.tool_input?.description;
  const parsed = parseDescription(description);
  return ['dispatch', { to, role: parsed?.role, description, ticket: parsed?.ticket ?? undefined }];
}

// A SendMessage either resumed a stopped agent (a dispatch) or was queued for a running one (a
// message). One that failed reached nobody.
function sendFields(root, call) {
  const res = call.tool_response;
  if (res?.success !== true) return undefined;
  const resumed = res.resumedAgentId;
  if (resumed) {
    const launch = lastDispatch(root, resumed);
    return ['dispatch', { to: resumed, role: launch?.role, description: launch?.description, ticket: launch?.ticket, resume: true }];
  }
  const to = res.pin?.id ?? call.tool_input?.to;
  return to ? ['message', { to }] : undefined;
}

// What prompted the call (spec #52, story 6): a line `Cause: <pointer>` in the prompt or message,
// such as `Cause: row:94`. The tools have no field for it, so the orchestrator writes it there.
// It is checked against the challenge-target grammar (parseTarget, factory/pointer.mjs).
const CAUSE = /^Cause: (\S+)[ \t]*\r?$/m;
const causeOf = (text) => (typeof text === 'string' ? CAUSE.exec(text)?.[1] : undefined);

const TOOLS = ['Agent', 'SendMessage'];

function main() {
  let call;
  try { call = JSON.parse(readFileSync(0, 'utf8')); } catch { return; }
  if (!TOOLS.includes(call?.tool_name) || call.agent_id) return;
  const root = defaultRoot();
  if (!inMarkedRun(root, call.session_id)) return;
  const run = safeId(call.session_id);
  const out = call.tool_name === 'Agent' ? launchFields(call) : sendFields(root, call);
  if (!out) return;
  const [type, fields] = out;
  const cause = causeOf(call.tool_name === 'Agent' ? call.tool_input?.prompt : call.tool_input?.message);
  // The call already happened, so a cause the target grammar rejects is kept and flagged.
  const target = cause === undefined ? undefined : parseTarget(cause);
  const causeInvalid = cause !== undefined && (!target || target.problem) ? true : undefined;
  writeEvent({
    root, run, agent: ORCHESTRATOR, type, fillUnknown: true,
    fields: { ...fields, tool_use_id: call.tool_use_id, cause, cause_invalid: causeInvalid },
  });
}

try {
  main();
} catch (err) {
  // Exit 1 is a non-blocking hook error: Claude Code shows it and the session goes on.
  process.stderr.write(`factory/hooks/dispatch.mjs: ${err.message}\n`);
  process.exit(1);
}
