#!/usr/bin/env node
// License, stars, last push and archived flag for many GitHub repos in one command, so an agent
// never writes a `for r in ...; do gh api repos/$r` loop (the worktree guard refuses those as too
// complex to verify; map #26 retro). Calls `gh api repos/<owner>/<repo>` per repo with no shell.
//
//   node scripts/repo-meta.mjs <owner/repo | https://github.com/owner/repo>...
//
// Prints a TSV with a header row, and exits 1 naming every repo whose lookup failed.
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const HEADER = ['repo', 'license', 'stars', 'pushed', 'archived'].join('\t');
const NAME = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export function parseArgs(argv) {
  if (!argv.length) throw new Error('name at least one owner/repo, e.g. node scripts/repo-meta.mjs ollama/ollama');
  return argv.map((a) => {
    const name = a.replace(/^https?:\/\/github\.com\//, '').replace(/\/+$/, '').replace(/\.git$/, '');
    if (!NAME.test(name)) throw new Error(`not an owner/repo: ${a}`);
    return name;
  });
}

// One TSV row from the JSON of `gh api repos/<owner>/<repo>`. A repo with no license file has
// license: null.
export function row(meta) {
  return [meta.full_name, meta.license?.spdx_id ?? 'none', meta.stargazers_count, String(meta.pushed_at ?? '').slice(0, 10), meta.archived].join('\t');
}

function lookup(repo) {
  const r = spawnSync('gh', ['api', `repos/${repo}`], { encoding: 'utf8', maxBuffer: 16 << 20 });
  if (r.error) throw new Error(`could not run gh: ${r.error.message}`);
  if (r.status !== 0) throw new Error(r.stderr.trim().split(/\r?\n/).pop() || `gh exited ${r.status}`);
  return JSON.parse(r.stdout);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  let repos;
  try { repos = parseArgs(process.argv.slice(2)); } catch (e) { console.error(`repo-meta: ${e.message}`); process.exit(2); }
  console.log(HEADER);
  const failed = [];
  for (const repo of repos) {
    try { console.log(row(lookup(repo))); } catch (e) { failed.push(`${repo} (${e.message})`); }
  }
  for (const f of failed) console.error(`repo-meta: failed: ${f}`);
  process.exit(failed.length ? 1 : 0);
}
