#!/usr/bin/env node
// Claude Code PreToolUse hook on Agent (spec #52, story 2; issue #55). In the orchestrated run (the
// session the run marker names, factory/run-marker.mjs) it denies a launch whose description
// doesn't follow the grammar in factory/description.mjs, so no agent runs with an unknown role or
// ticket. Other sessions, and a subagent's own Agent calls (payload has agent_id), are not checked.
//
// Exit 2 blocks the call and shows stderr to the orchestrator; exit 0 lets it run. A payload it
// can't read passes.
import { readFileSync } from 'node:fs';
import { EXAMPLES, GRAMMAR, parseDescription } from '../description.mjs';
import { defaultRoot } from '../log.mjs';
import { inMarkedRun } from '../run-marker.mjs';

function main() {
  let call;
  try { call = JSON.parse(readFileSync(0, 'utf8')); } catch { return; }
  if (call?.tool_name !== 'Agent' || call.agent_id) return;
  if (!inMarkedRun(defaultRoot(), call.session_id)) return;
  const description = call.tool_input?.description;
  if (parseDescription(description)) return;
  process.stderr.write(`Blocked: the agent description ${JSON.stringify(description ?? '')} doesn't follow `
    + `\`${GRAMMAR}\`: a lowercase role word, the ticket it serves (#- for none), then what it does, `
    + `such as \`${EXAMPLES[0]}\` or \`${EXAMPLES[1]}\`. Relaunch with a description in that form.\n`);
  process.exit(2);
}

try {
  main();
} catch (err) {
  // Exit 1 is a non-blocking hook error: Claude Code shows it and the launch goes on.
  process.stderr.write(`factory/hooks/agent-description.mjs: ${err.message}\n`);
  process.exit(1);
}
