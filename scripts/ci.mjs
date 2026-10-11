#!/usr/bin/env node
// Local CI: runs `npm test` inside a pinned Node container on this machine's Docker Desktop.
// No GitHub Actions or hosted runner (see AGENTS.md). The repo is mounted read-only and the
// container has no network, so tests can only write to the container's own temp dir.
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const IMAGE = 'node:24.15.0-alpine';
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const args = ['run', '--rm', '--network', 'none', '-v', `${repo}:/app:ro`, '-w', '/app', IMAGE, 'npm', 'test'];
console.log(`ci: docker ${args.join(' ')}`);
// MSYS_NO_PATHCONV stops Git Bash from rewriting /app into a Windows path.
const r = spawnSync('docker', args, { stdio: 'inherit', env: { ...process.env, MSYS_NO_PATHCONV: '1' } });
if (r.error) {
  console.error(`ci: could not run docker: ${r.error.message}. Is Docker Desktop running?`);
  process.exit(1);
}
console.log(r.status === 0 ? 'ci: PASS' : `ci: FAIL (exit ${r.status})`);
process.exit(r.status ?? 1);
