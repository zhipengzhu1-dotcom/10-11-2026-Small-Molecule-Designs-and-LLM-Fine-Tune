#!/usr/bin/env node
// Claude Code UserPromptSubmit / PostToolUse hook: the context meter. In the orchestrated run
// (the session the run marker names, factory/run-marker.mjs) it injects one line with the
// session's current context size, read from its transcript (factory/transcript.mjs), so the
// orchestrator's budget check runs on a number instead of a guess. Other sessions, and tool
// calls inside subagents, get nothing.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { defaultRoot } from '../log.mjs';
import { readMarker } from '../run-marker.mjs';
import { contextTokens } from '../transcript.mjs';

function main() {
  const payload = JSON.parse(readFileSync(0, 'utf8'));
  // A subagent's tool calls carry its agent_id; the orchestrator's own never do.
  if (payload.agent_id || !payload.session_id || !payload.transcript_path) return;
  const marker = readMarker(defaultRoot());
  if (!marker || marker.run !== payload.session_id) return;
  let tokens;
  try {
    tokens = contextTokens(payload.transcript_path.replace(/^~(?=[\\/])/, homedir()));
  } catch {
    return; // no transcript yet
  }
  if (tokens == null) return;
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: payload.hook_event_name,
      additionalContext: `Context meter: ${tokens.toLocaleString('en-US')} tokens in context (latest main-thread reply).`,
    },
  }));
}

try {
  main();
} catch (err) {
  // Exit 1 is a non-blocking hook error: Claude Code shows it and the session goes on.
  process.stderr.write(`factory/hooks/context-meter.mjs: ${err.message}\n`);
  process.exit(1);
}
