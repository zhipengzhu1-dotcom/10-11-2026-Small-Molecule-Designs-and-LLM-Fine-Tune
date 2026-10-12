// The one way factory code runs git: `git -C <dir> ...`, never through a shell.
import { spawnSync } from 'node:child_process';

// Runs git in dir and returns the spawn result, for callers that read its status.
export function gitRun(dir, ...args) {
  return spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8', maxBuffer: 64 << 20 });
}

// Runs git in dir and returns its trimmed stdout; throws, with git's message, when it fails.
export function git(dir, ...args) {
  const r = gitRun(dir, ...args);
  if (r.error || r.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed:\n${(r.error?.message ?? (r.stderr || r.stdout)).trim()}`);
  }
  return r.stdout.trim();
}
