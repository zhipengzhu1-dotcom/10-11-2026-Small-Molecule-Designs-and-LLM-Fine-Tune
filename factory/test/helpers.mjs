// Test helpers: drive the factory through the same entry points agents and hooks use.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const FACTORY = dirname(dirname(fileURLToPath(import.meta.url)));
export const REPO = dirname(FACTORY);
export const WRITER = join(FACTORY, 'log.mjs');
export const HOOK = join(FACTORY, 'hooks', 'subagent.mjs');

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

export function hook(payload, extraEnv = {}) {
  const input = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return spawnSync(process.execPath, [HOOK], { env: env(extraEnv), input, encoding: 'utf8' });
}
