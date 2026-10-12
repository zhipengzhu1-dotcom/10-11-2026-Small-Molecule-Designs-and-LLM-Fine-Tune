#!/usr/bin/env node
// Claude Code SubagentStart / SubagentStop hook. Reads the hook payload on stdin and records
// agent.start / agent.stop through the event writer, in the file of the agent it describes:
//   factory/agents/<session_id>/<agent_id>.jsonl under CLAUDE_PROJECT_DIR (the main checkout).
// The run id is the orchestrator's session_id. A field the payload lacks is recorded as "unknown".
// On SubagentStart it also tells the subagent its ids and the command to write its own events.
// It acts only in the orchestrated run named by the run marker (factory/run-marker.mjs).
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { UNKNOWN, activityFile, defaultRoot, writeEvent } from '../log.mjs';
import { inMarkedRun } from '../run-marker.mjs';

// The payload has no parent field. Claude Code fires these hooks only for agents the orchestrator
// session spawns, never for one a subagent spawns, so every agent recorded here is its child.
const PARENT = 'orchestrator';

// agent.stop keeps the hand-back report whole up to this many characters, a safety cap on one
// event line. A longer report is cut here and flagged report_truncated (spec #52, story 8).
const REPORT_CAP = 64 * 1024;

// An id safe as a file name: characters outside [A-Za-z0-9._-] become _, leading punctuation goes,
// and a missing or emptied id is "unknown".
const safeId = (v) => (v ? String(v).replace(/[^A-Za-z0-9._-]/g, '_').replace(/^[._-]+/, '') || UNKNOWN : UNKNOWN);
const slash = (p) => p.replace(/\\/g, '/');

function statusOf(message) {
  const m = /\b(PASS|ISSUES|BLOCKED)\b/.exec(message || '');
  return m ? m[1] : undefined;
}

// Subagents usually report through a SubagentHandback tool call, which last_assistant_message
// doesn't include. Then read the subagent's transcript: the last SubagentHandback message,
// else the last assistant text block. Any read or parse problem leaves the status unknown.
function reportsFromTranscript(path) {
  let text;
  try {
    text = readFileSync(path.replace(/^~(?=[\\/])/, homedir()), 'utf8');
  } catch {
    return [];
  }
  let handback, lastText;
  for (const line of text.split('\n')) {
    let o;
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }
    const content = o?.type === 'assistant' && o.message?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (block?.type === 'tool_use' && block.name === 'SubagentHandback' && typeof block.input?.message === 'string') {
        handback = block.input.message;
      } else if (block?.type === 'text' && typeof block.text === 'string') {
        lastText = block.text;
      }
    }
  }
  return [handback, lastText];
}

// The hand-back: its status, and its report, the text the status was read from. With no status
// anywhere, the report is the SubagentHandback message, else the final message, else the last
// assistant text.
function handBack(payload) {
  const direct = payload.last_assistant_message || undefined;
  const status = statusOf(direct);
  if (status || !payload.agent_transcript_path) return { status, report: direct };
  const [handback, lastText] = reportsFromTranscript(payload.agent_transcript_path);
  for (const report of [handback, lastText]) {
    const s = statusOf(report);
    if (s) return { status: s, report };
  }
  return { status: undefined, report: handback || direct || lastText || undefined };
}

// The writer is the log.mjs next to this hook, i.e. the main checkout's copy, never a worktree's.
const WRITER = slash(fileURLToPath(new URL('../log.mjs', import.meta.url)));

function writerCommand(root, run, agent) {
  return `node "${WRITER}" --root "${slash(root)}" --run ${run} --agent ${agent}`;
}

function contextFor(root, run, agent) {
  return [
    `Factory activity log. Your agent id: ${agent}. Your run id: ${run}.`,
    'Record your own artifact, fetch.failed and check events in your own activity file with this command,',
    'followed by the event type and key=value fields (quote values with spaces):',
    `    ${writerCommand(root, run, agent)}`,
    'Types and required fields:',
    '  artifact path=<file> kind=<notes|table|figure|catalog|ref|report|...>',
    '  fetch.failed ref=<bib key> url=<url> reason=<why>',
    '  check name=<check> result=<pass|fail> evidence=<path or pointer>',
    'Example:',
    `    ${writerCommand(root, run, agent)} artifact path=research/s1/notes/paper.md kind=notes`,
    'Do not pass ts, run or agent as fields and never write to another agent\'s file.',
    'agent.start and agent.stop are recorded for you. Start your final report with PASS, ISSUES or BLOCKED:',
    'that word becomes the status of your agent.stop event.',
  ].join('\n');
}

function main() {
  const payload = JSON.parse(readFileSync(0, 'utf8'));
  const root = defaultRoot();
  const run = safeId(payload.session_id);
  const agent = safeId(payload.agent_id);
  const role = payload.agent_type || undefined;
  // Only the orchestrated run the marker names is logged (factory/run-marker.mjs). Other sessions
  // in this repo, such as reflect or review, write nothing. A payload with no session id is
  // recorded under run "unknown" while any run is marked.
  if (!inMarkedRun(root, payload.session_id)) return;

  switch (payload.hook_event_name) {
    case 'SubagentStart': {
      writeEvent({ root, run, agent, type: 'agent.start', fields: { role, parent: PARENT }, fillUnknown: true });
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: { hookEventName: 'SubagentStart', additionalContext: contextFor(root, run, agent) },
      }));
      break;
    }
    case 'SubagentStop': {
      // Claude Code's internal side agents (prompt suggestions, /btw) stop with an empty
      // agent_type and never start. Skip them unless the agent already has an activity file.
      if (!role && !existsSync(activityFile(root, run, agent))) break;
      // No transcript field: the contract doesn't list one, and the path follows from run and agent.
      const { status, report } = handBack(payload);
      const fields = { role, status, report };
      if (report?.length > REPORT_CAP) Object.assign(fields, { report: report.slice(0, REPORT_CAP), report_truncated: true });
      writeEvent({ root, run, agent, type: 'agent.stop', fields, fillUnknown: true });
      break;
    }
    default:
      throw new Error(`unexpected hook_event_name: ${payload.hook_event_name}`);
  }
}

try {
  main();
} catch (err) {
  // Exit 1 is a non-blocking hook error: Claude Code shows it but the subagent still runs.
  process.stderr.write(`factory/hooks/subagent.mjs: ${err.message}\n`);
  process.exit(1);
}
