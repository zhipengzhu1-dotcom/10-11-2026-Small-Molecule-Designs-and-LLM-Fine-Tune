#!/usr/bin/env node
// PreToolUse hook for Bash (s1 retro, issue #48). Blocks a command that carries more than LIMIT
// lines of heredoc text: two such commands, each writing several issue bodies, failed in bash
// with "unexpected EOF while looking for matching `''" and had to be redone. Long text goes
// through the Write tool, and gh takes it with --body-file.
//
// Claude Code passes the tool call as JSON on stdin. Exit 2 blocks the call and shows stderr to
// the agent; exit 0 lets it run. Anything it can't read passes.
import { readFileSync } from 'node:fs';

const LIMIT = 40;

// Lines of heredoc text in a shell command: everything between a `<<WORD` (or `<<'WORD'`,
// `<<-WORD`) line and the line holding only WORD.
export function heredocLines(command) {
  let total = 0;
  let end = null;
  for (const line of command.split(/\r?\n/)) {
    if (end !== null) {
      if (line.trim() === end) end = null;
      else total++;
      continue;
    }
    const m = /<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1/.exec(line);
    if (m) end = m[2];
  }
  return total;
}

let call;
try { call = JSON.parse(readFileSync(0, 'utf8')); } catch { process.exit(0); }
if (call?.tool_name !== 'Bash' || typeof call.tool_input?.command !== 'string') process.exit(0);
const n = heredocLines(call.tool_input.command);
if (n > LIMIT) {
  process.stderr.write(`Blocked: this command carries ${n} lines of heredoc text (limit ${LIMIT}). `
    + 'Write long text to a file with the Write tool, one file per call, then pass the file '
    + '(gh issue create/comment/edit and gh pr create take --body-file).\n');
  process.exit(2);
}
