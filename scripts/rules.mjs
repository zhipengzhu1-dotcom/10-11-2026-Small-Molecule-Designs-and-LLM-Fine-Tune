#!/usr/bin/env node
// Repo rules that agents broke while they were only written down (s1 retro, issue #48). Exits 0
// when the repo keeps them, 1 with one line per breach naming the fix. Writes no event, so it can
// run on a read-only tree; the test suite runs it, and so CI does.
//
//   node scripts/rules.mjs [--root <repo>]
//
// - CI runs in Docker on this machine (scripts/ci.mjs), so there is no .github/workflows/.
// - Tests run on fixtures. A test that reads the project's live data (the decision log, audits,
//   activity files, research/) breaks the test gate whenever that data grows; rules about the real
//   data belong in a check under factory/checks/.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cli } from '../factory/cli.mjs';

const LIVE_DATA = [
  /\breadStream\(\s*REPO\b/,
  /\bjoin\(\s*REPO\s*,\s*['"](research|factory['"]\s*,\s*['"](decisions\.tsv|audit|agents))\b/,
  /['"]--root['"]\s*,\s*REPO\b/,
];

// Lines of a test file that read the project's live data.
export function liveDataUses(text) {
  return text.split(/\r?\n/).map((t, i) => ({ line: i + 1, text: t.trim() })).filter((l) => LIVE_DATA.some((re) => re.test(l.text)));
}

export function breaches(root) {
  const out = [];
  if (existsSync(join(root, '.github', 'workflows'))) {
    out.push('.github/workflows/ exists: CI runs in Docker on this machine (npm run ci), never on a hosted runner; delete it');
  }
  const tests = join(root, 'factory', 'test');
  for (const f of readdirSync(tests).filter((n) => n.endsWith('.test.mjs') && n !== 'rules.test.mjs')) {
    for (const u of liveDataUses(readFileSync(join(tests, f), 'utf8'))) {
      out.push(`factory/test/${f}:${u.line} reads the project's live data (${u.text}); build a fixture in a temp root instead`);
    }
  }
  return out;
}

cli(import.meta.url, { usage: 'node scripts/rules.mjs [--root <repo>]', options: { root: 'string' } }, (opts) => {
  const found = breaches(opts.root ?? resolve(dirname(fileURLToPath(import.meta.url)), '..'));
  for (const b of found) console.error(`rules: ${b}`);
  console.log(found.length ? `rules: fail (${found.length})` : 'rules: pass');
  return found.length ? 1 : 0;
});
