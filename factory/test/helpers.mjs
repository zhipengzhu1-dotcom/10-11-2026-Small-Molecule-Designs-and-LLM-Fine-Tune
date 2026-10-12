// Test helpers: drive the factory through the same entry points agents and hooks use.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const FACTORY = dirname(dirname(fileURLToPath(import.meta.url)));
export const REPO = dirname(FACTORY);
const WRITER = join(FACTORY, 'log.mjs');
const HOOK = join(FACTORY, 'hooks', 'subagent.mjs');
const MARKER = join(FACTORY, 'run-marker.mjs');
const MERGE = join(FACTORY, 'merge.mjs');

export function tempRoot() {
  return mkdtempSync(join(tmpdir(), 'factory-test-'));
}

// Clean env so a developer's own FACTORY_* or CLAUDE_PROJECT_DIR never leaks into a test.
function env(extra) {
  const e = { ...process.env };
  for (const k of ['FACTORY_ROOT', 'FACTORY_RUN', 'FACTORY_AGENT', 'CLAUDE_PROJECT_DIR']) delete e[k];
  return { ...e, ...extra };
}

export function write(args, extraEnv = {}) {
  return spawnSync(process.execPath, [WRITER, ...args], { env: env(extraEnv), encoding: 'utf8' });
}

export function writeAsync(args, extraEnv = {}) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [WRITER, ...args], { env: env(extraEnv) });
    let stderr = '';
    p.stderr.on('data', (d) => (stderr += d));
    p.on('close', (status) => resolve({ status, stderr }));
  });
}

// Runs the hook the way Claude Code does: payload JSON on stdin, CLAUDE_PROJECT_DIR in env,
// cwd wherever the session is (a worktree, for subagents).
export function hook(payload, extraEnv = {}, cwd = tempRoot()) {
  const input = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return spawnSync(process.execPath, [HOOK], { env: env(extraEnv), input, cwd, encoding: 'utf8' });
}

// Runs the context meter hook the way Claude Code does: payload JSON on stdin.
export const METER = join(FACTORY, 'hooks', 'context-meter.mjs');
export function meter(payload, extraEnv = {}, cwd = tempRoot()) {
  return spawnSync(process.execPath, [METER], { env: env(extraEnv), input: JSON.stringify(payload), cwd, encoding: 'utf8' });
}

// Runs the run-marker CLI, as the orchestrator does when a run starts or ends.
export function marker(args, extraEnv = {}) {
  return spawnSync(process.execPath, [MARKER, ...args], { env: env(extraEnv), encoding: 'utf8' });
}

// Runs the merge script, as a merger does in the main checkout.
export function merge(args, extraEnv = {}) {
  return spawnSync(process.execPath, [MERGE, ...args], { env: env(extraEnv), encoding: 'utf8' });
}

// Starts the fetch page CLI on a free port, the way a user would, and resolves once it prints
// its URL. Call stop() when done.
const FETCH_PAGE = join(FACTORY, 'fetch-page.mjs');
export function startFetchPage(args = [], extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [FETCH_PAGE, '--port', '0', ...args], { env: env(extraEnv) });
    let out = '';
    let err = '';
    p.stderr.on('data', (d) => (err += d));
    p.stdout.on('data', (d) => {
      out += d;
      const m = /(http:\/\/127\.0\.0\.1:\d+)\//.exec(out);
      if (m) resolve({ url: m[1], stop: () => new Promise((r) => { p.on('close', r); p.kill(); }) });
    });
    p.on('close', (status) => reject(new Error(`fetch page exited ${status}: ${err}`)));
  });
}

// Runs a command line through the platform shell, as an agent's Bash tool would.
export function shell(command, cwd = tempRoot()) {
  return spawnSync(command, { shell: true, env: env({}), cwd, encoding: 'utf8' });
}
