#!/usr/bin/env node
// PreToolUse hook for Bash and PowerShell (issue #15). Blocks a subagent's `git config` write
// that has no --worktree: an implementer in a worktree set core.hooksPath in the shared
// .git/config, which changed push behavior for every checkout. It reads commands inside $(...),
// bash -c, cmd /c and powershell -Command too, and lets through writes to another file or to
// another repo's config (a throwaway test repo), which no checkout of the project reads.
//
// Claude Code passes the tool call as JSON on stdin. A call made inside a subagent carries
// agent_id; the main session's does not (code.claude.com/docs/en/hooks.md, common input fields).
// Exit 2 blocks the call and shows stderr to the agent; exit 0 lets it run. Anything it can't
// read passes.
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gitRun } from '../git.mjs';

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
    else if (c === '$' && text[i + 1] === '(') {
      // A command substitution (bash $(...), PowerShell's subexpression) runs its own commands.
      const j = closingParen(text, i + 2);
      out.push(...commands(text.slice(i + 2, j)));
      i = j + 1;
    } else if (c === "'") {
      const close = text.indexOf("'", i + 1);
      const j = close === -1 ? text.length : close;
      word = (word ?? '') + text.slice(i + 1, j);
      i = j + 1;
    } else if (c === '"') {
      let j = i + 1;
      let s = '';
      while (j < text.length && text[j] !== '"') {
        if (text[j] === '$' && text[j + 1] === '(') {
          // Both shells run a substitution inside double quotes too.
          const k = closingParen(text, j + 2);
          out.push(...commands(text.slice(j + 2, k)));
          j = k + 1;
        } else if (text[j] === '\\' && j + 1 < text.length) { s += text[j + 1]; j += 2; } else s += text[j++];
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

// The index of the `)` that closes a parenthesis opened just before `from`, skipping quoted text.
function closingParen(text, from) {
  let depth = 1;
  for (let i = from; i < text.length; i++) {
    const c = text[i];
    if (c === "'" || c === '"') {
      const close = text.indexOf(c, i + 1);
      i = close === -1 ? text.length : close;
    } else if (c === '(') depth++;
    else if (c === ')' && --depth === 0) return i;
  }
  return text.length;
}

// The command string a shell is handed (bash -c '...', cmd /c ..., powershell -Command ...), or
// null when the words don't start a shell that way.
const SHELL = /^(?:.*[\\/])?(bash|sh|zsh|dash|cmd|powershell|pwsh)(?:\.exe)?$/i;
function handed(w) {
  const shell = SHELL.exec(w[0] ?? '')?.[1].toLowerCase();
  if (!shell) return null;
  const flag = shell === 'cmd' ? /^\/[ck]$/i : /^(powershell|pwsh)$/.test(shell) ? /^-c(ommand)?$/i : /^-[a-z]*c[a-z]*$/;
  const i = w.findIndex((a, k) => k > 0 && flag.test(a));
  if (i === -1 || i + 1 >= w.length) return null;
  // bash takes the one word after -c; cmd and PowerShell run the rest of the line.
  return /^(cmd|powershell|pwsh)$/.test(shell) ? w.slice(i + 1).join(' ') : w[i + 1];
}

// A path word as the shell would see it: env vars expanded, ~ as home, Git Bash's /c/... as C:/...
function expand(path) {
  let p = path.replace(/\$\{?(?:env:)?(\w+)\}?/gi, (m, v) => process.env[v] ?? m);
  if (p === '~' || p.startsWith('~/')) p = homedir() + p.slice(1);
  if (process.platform === 'win32') p = p.replace(/^\/([a-z])(?=\/|$)/i, '$1:');
  return p;
}
const at = (dir, path) => resolve(dir, expand(path));
const same = (a, b) => (process.platform === 'win32' ? resolve(a).toLowerCase() === resolve(b).toLowerCase() : resolve(a) === resolve(b));

// The git common dir (the .git every checkout of a repo shares) for a directory, or null outside a
// repo. A directory that doesn't exist yet is looked up from its nearest existing parent.
function commonDir(dir) {
  let d = resolve(dir);
  while (!existsSync(d) && dirname(d) !== d) d = dirname(d);
  const r = gitRun(d, 'rev-parse', '--path-format=absolute', '--git-common-dir');
  return r.status === 0 ? resolve(r.stdout.trim()) : null;
}

// The git config command in the words, with the directory it runs in, else null.
function configCommand(w, dir) {
  if (!/^(.*[\\/])?git(\.exe)?$/i.test(w[0] ?? '')) return null;
  let i = 1;
  while (w[i]?.startsWith('-')) {
    if (w[i] === '-C' && w[i + 1] !== undefined) dir = at(dir, w[i + 1]);
    i += GIT_TAKES_VALUE.has(w[i]) ? 2 : 1;
  }
  return w[i] === 'config' ? { args: w.slice(i + 1), dir } : null;
}

// True when the args after `git config` write config.
function writes(args) {
  if (args.some((a) => WRITE_FLAGS.has(a))) return true;
  if (args.some((a) => READ_FLAGS.has(a))) return false;
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    if (TAKES_VALUE.has(args[i])) i++;
    else if (!args[i].startsWith('-')) positional.push(args[i]);
  }
  // `git config get|list ...` and `git config <key>` read; a key with a value writes.
  return !(READ_SUBCOMMANDS.has(positional[0]) || positional.length === 1);
}

// True when a git config write run in dir lands in a config every checkout of the project shares:
// the user's or system's config, the project's .git/config, or a --file that names it. A write
// with --worktree, to another file, or in another repo (a test fixture) does not.
function shared(args, dir, project) {
  if (args.includes('--worktree')) return false;
  if (args.includes('--global') || args.includes('--system')) return true;
  if (!project) return true;
  const f = args.findIndex((a) => a === '-f' || a === '--file');
  const file = f !== -1 ? args[f + 1] : args.find((a) => a.startsWith('--file='))?.slice(7);
  if (file !== undefined) return same(at(dir, file), join(project, 'config'));
  const common = commonDir(dir);
  return common !== null && same(common, project);
}

// The commands in a shell command line, run from dir, that write the git config every checkout
// shares: a `git config` write without --worktree, or the npm script that sets core.hooksPath.
// cd follows the line in order; a shell handed a command string is read like the line itself.
const CD = /^(cd|chdir|pushd|sl|set-location|push-location)$/i;
function sharedConfigWrites(command, dir, project) {
  const found = [];
  for (const w of commands(command)) {
    if (CD.test(w[0])) {
      const to = w.slice(1).find((a) => !a.startsWith('-'));
      dir = to === undefined ? homedir() : at(dir, to);
      continue;
    }
    const inner = handed(w);
    if (inner !== null) found.push(...sharedConfigWrites(inner, dir, project));
    else if (w[0] === 'npm' && (w[1] === 'run' || w[1] === 'run-script') && w[2] === 'hooks:install') found.push(w.join(' '));
    else {
      const config = configCommand(w, dir);
      if (config && writes(config.args) && shared(config.args, config.dir, project)) found.push(w.join(' '));
    }
  }
  return found;
}

let call;
try { call = JSON.parse(readFileSync(0, 'utf8')); } catch { process.exit(0); }
if (!call?.agent_id || typeof call.tool_input?.command !== 'string') process.exit(0);
// The project whose shared config this guards: Claude Code's project dir, else the repo holding
// this hook. When git can't name its common dir, every write without --worktree is blocked.
const project = commonDir(process.env.CLAUDE_PROJECT_DIR || fileURLToPath(new URL('../..', import.meta.url)));
const found = sharedConfigWrites(call.tool_input.command, call.cwd || process.cwd(), project);
if (found.length) {
  process.stderr.write(`Blocked: \`${found[0]}\` writes the git config every checkout shares. `
    + 'Subagents may only write their own worktree\'s config: add --worktree '
    + '(git config --worktree <key> <value>). If the shared config needs the change, or git '
    + 'refuses --worktree because extensions.worktreeConfig is off, report it to the orchestrator '
    + 'for the user\'s approval instead.\n');
  process.exit(2);
}
