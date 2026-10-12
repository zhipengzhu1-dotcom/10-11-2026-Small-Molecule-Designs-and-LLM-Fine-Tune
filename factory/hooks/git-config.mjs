#!/usr/bin/env node
// PreToolUse hook for Bash and PowerShell (issue #15). Blocks a subagent's `git config` write
// that has no --worktree: an implementer in a worktree set core.hooksPath in the shared
// .git/config, which changed push behavior for every checkout.
//
// Claude Code passes the tool call as JSON on stdin. A call made inside a subagent carries
// agent_id; the main session's does not (code.claude.com/docs/en/hooks.md, common input fields).
// Exit 2 blocks the call and shows stderr to the agent; exit 0 lets it run. Anything it can't
// read passes.
import { readFileSync } from 'node:fs';

const READ_FLAGS = new Set(['--get', '--get-all', '--get-regexp', '--get-urlmatch', '--get-color',
  '--get-colorbool', '-l', '--list']);
const WRITE_FLAGS = new Set(['--unset', '--unset-all', '--add', '--replace-all', '--rename-section',
  '--remove-section', '-e', '--edit']);
const READ_SUBCOMMANDS = new Set(['get', 'list']);
// Options whose value is the next word, so it isn't counted as a key or value.
const TAKES_VALUE = new Set(['--type', '--default', '-f', '--file', '--blob', '--comment', '--value', '--url']);
// git's own options before the subcommand that take the next word, as in `git -C <path> config`.
const GIT_TAKES_VALUE = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--config-env']);

// Splits one shell command into words, dropping quotes. Good enough to read a git command line.
function words(segment) {
  return [...segment.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map((m) => m[1] ?? m[2] ?? m[3]);
}

// The args after `config` when the words are a git config command, else null.
function configArgs(w) {
  if (!/^(.*[\\/])?git(\.exe)?$/i.test(w[0] ?? '')) return null;
  let i = 1;
  while (w[i]?.startsWith('-')) i += GIT_TAKES_VALUE.has(w[i]) ? 2 : 1;
  return w[i] === 'config' ? w.slice(i + 1) : null;
}

// True when the args after `git config` only read config or write the worktree's own.
function readOrWorktree(args) {
  if (args.includes('--worktree')) return true;
  if (args.some((a) => WRITE_FLAGS.has(a))) return false;
  if (args.some((a) => READ_FLAGS.has(a))) return true;
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    if (TAKES_VALUE.has(args[i])) i++;
    else if (!args[i].startsWith('-')) positional.push(args[i]);
  }
  // `git config get|list ...` and `git config <key>` read; a key with a value writes.
  return READ_SUBCOMMANDS.has(positional[0]) || positional.length === 1;
}

// The commands in a shell command line that write the git config every checkout shares: a
// `git config` write without --worktree, or the npm script that sets core.hooksPath.
function sharedConfigWrites(command) {
  return command.replace(/\d*>>?(&\d+|\s*\S+)/g, '').split(/\r?\n|&&|\|\||[;|&]/).map((s) => s.trim()).filter((s) => {
    if (/^npm\s+(run|run-script)\s+hooks:install\b/.test(s)) return true;
    const args = configArgs(words(s));
    return args !== null && !readOrWorktree(args);
  });
}

let call;
try { call = JSON.parse(readFileSync(0, 'utf8')); } catch { process.exit(0); }
if (!call?.agent_id || typeof call.tool_input?.command !== 'string') process.exit(0);
const writes = sharedConfigWrites(call.tool_input.command);
if (writes.length) {
  process.stderr.write(`Blocked: \`${writes[0]}\` writes the git config every checkout shares. `
    + 'Subagents may only write their own worktree\'s config: add --worktree '
    + '(git config --worktree <key> <value>). If the shared config needs the change, or git '
    + 'refuses --worktree because extensions.worktreeConfig is off, report it to the orchestrator '
    + 'for the user\'s approval instead.\n');
  process.exit(2);
}
