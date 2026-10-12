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

// Splits a shell command line into simple commands, each a list of words with quotes removed.
// Separators (newline ; & && | ||) count only outside quotes; redirections and their targets are
// dropped; heredoc bodies are skipped. Text inside quotes is never a command of its own.
function commands(text) {
  const out = [];
  let cmd = [];
  let word = null;
  let heredocs = [];
  const endWord = () => { if (word !== null) cmd.push(word); word = null; };
  const endCmd = () => { endWord(); if (cmd.length) out.push(cmd); cmd = []; };
  // Reads a word from i (for a redirection target or heredoc delimiter); returns [word, next i].
  const readWord = (i) => {
    while (text[i] === ' ' || text[i] === '\t') i++;
    let w = '';
    while (i < text.length && !/[\s;&|<>]/.test(text[i])) {
      const q = text[i];
      if (q === '"' || q === "'") {
        const close = text.indexOf(q, i + 1);
        const j = close === -1 ? text.length : close;
        w += text.slice(i + 1, j);
        i = j + 1;
      } else w += text[i++];
    }
    return [w, i];
  };
  for (let i = 0; i < text.length;) {
    const c = text[i];
    if (c === '\n') {
      endCmd();
      i++;
      // Skip the bodies of heredocs opened on the line just ended.
      for (const delim of heredocs) {
        while (i < text.length) {
          const eol = text.indexOf('\n', i);
          const line = text.slice(i, eol === -1 ? text.length : eol).replace(/\r$/, '');
          i = eol === -1 ? text.length : eol + 1;
          if (line.trim() === delim) break;
        }
      }
      heredocs = [];
    } else if (c === ' ' || c === '\t' || c === '\r') { endWord(); i++; }
    else if (c === ';' || c === '&' || c === '|') { endCmd(); i++; }
    // A backslash escapes only shell syntax, so a Windows path like C:\Git\cmd\git.exe stays whole.
    else if (c === '\\' && /[\s;&|<>"'\\]/.test(text[i + 1] ?? '')) { word = (word ?? '') + text[i + 1]; i += 2; }
    else if (c === "'") {
      const close = text.indexOf("'", i + 1);
      const j = close === -1 ? text.length : close;
      word = (word ?? '') + text.slice(i + 1, j);
      i = j + 1;
    } else if (c === '"') {
      let j = i + 1;
      let s = '';
      while (j < text.length && text[j] !== '"') {
        if (text[j] === '\\' && j + 1 < text.length) { s += text[j + 1]; j += 2; } else s += text[j++];
      }
      word = (word ?? '') + s;
      i = j + 1;
    } else if (c === '<' && text[i + 1] === '<' && text[i + 2] !== '<') {
      endWord();
      i += text[i + 2] === '-' ? 3 : 2;
      const [delim, next] = readWord(i);
      heredocs.push(delim);
      i = next;
    } else if (c === '<' || c === '>') {
      // A redirection: drop a leading fd number, the operator and its target.
      if (word !== null && /^\d+$/.test(word)) word = null;
      endWord();
      while (text[i] === '<' || text[i] === '>') i++;
      if (text[i] === '&') i++;
      i = readWord(i)[1];
    } else { word = (word ?? '') + c; i++; }
  }
  endCmd();
  return out;
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
  return commands(command).filter((w) => {
    if (w[0] === 'npm' && (w[1] === 'run' || w[1] === 'run-script') && w[2] === 'hooks:install') return true;
    const args = configArgs(w);
    return args !== null && !readOrWorktree(args);
  }).map((w) => w.join(' '));
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
