#!/usr/bin/env node
// Log one decision row (pstack show-me-your-work) to factory/decisions.tsv, the orchestrator's
// decision log. It runs the skill's own log.sh from the installed pstack, and puts the pointer to
// the session transcript at the moment of the decision first in the evidence cell.
//
//   npm run decide -- [--root <repo>] [--run <session-id>] <phase> <decision> <why> <evidence> <result>
//
// Root:     --root, else FACTORY_ROOT, else CLAUDE_PROJECT_DIR, else this repo (see log.mjs).
// log.sh:   <installPath>/skills/show-me-your-work/scripts/log.sh, where installPath is the
//           pstack@pstack-marketplace entry of ~/.claude/plugins/installed_plugins.json. The plugin
//           cache keeps stale versions beside it, so never hard-code a cache path.
// Session:  --run, else FACTORY_RUN, else the most recently written transcript of this project.
//           The pointer is "~/.claude/projects/<slug>/<session>.jsonl @<HH:MM:SS>Z", the time of the
//           transcript's latest entry.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultRoot } from './log.mjs';
import { latestSession, projectTranscripts, readTranscript } from './transcript.mjs';

export class DecideError extends Error {}

const PLUGIN = 'pstack@pstack-marketplace';

// The show-me-your-work log.sh of the pstack that Claude Code has installed.
export function logScript(home = homedir()) {
  const registry = join(home, '.claude', 'plugins', 'installed_plugins.json');
  if (!existsSync(registry)) throw new DecideError(`no ${registry}; is pstack installed?`);
  const installPath = JSON.parse(readFileSync(registry, 'utf8')).plugins?.[PLUGIN]?.[0]?.installPath;
  if (!installPath) throw new DecideError(`${registry} has no ${PLUGIN} entry; is pstack installed?`);
  const script = join(installPath, 'skills', 'show-me-your-work', 'scripts', 'log.sh');
  if (!existsSync(script)) throw new DecideError(`${script} does not exist; reinstall pstack`);
  return script;
}

// The evidence pointer to a session transcript's latest entry, written with ~ for the home folder.
export function transcriptPointer(dir, session) {
  const file = join(dir, `${session}.jsonl`);
  if (!existsSync(file)) throw new DecideError(`no transcript at ${file}`);
  const ts = readTranscript(file).findLast((e) => typeof e?.timestamp === 'string')?.timestamp;
  if (!ts) throw new DecideError(`${file} has no timestamped entry`);
  return `~/.claude/projects/${basename(dir)}/${session}.jsonl @${ts.slice(11, 19)}Z`;
}

// Git Bash, not the WSL bash.exe that Windows puts first on PATH.
function bash() {
  if (process.platform !== 'win32') return 'bash';
  const exec = spawnSync('git', ['--exec-path'], { encoding: 'utf8' });
  const gitBash = exec.status === 0 && join(exec.stdout.trim(), '..', '..', '..', 'bin', 'bash.exe');
  if (!gitBash || !existsSync(gitBash)) throw new DecideError('cannot find Git Bash (git --exec-path/../../../bin/bash.exe)');
  return gitBash;
}

export function decide({ root, run, cells, home = homedir() }) {
  if (cells.length !== 5) throw new DecideError('expected 5 cells: <phase> <decision> <why> <evidence> <result>');
  const script = logScript(home);
  const dir = projectTranscripts(root, home);
  const session = run || latestSession(dir);
  if (!session) throw new DecideError(`no session transcript in ${dir}; pass --run <session-id>`);
  const [phase, decision, why, evidence, result] = cells;
  const pointer = transcriptPointer(dir, session);
  const log = join(root, 'factory', 'decisions.tsv').replace(/\\/g, '/');
  const r = spawnSync(bash(), [script.replace(/\\/g, '/'), log, phase, decision, why, evidence ? `${pointer}; ${evidence}` : pointer, result], {
    encoding: 'utf8', env: { ...process.env, MSYS_NO_PATHCONV: '1' },
  });
  if (r.error || r.status !== 0) throw new DecideError(`log.sh failed: ${r.error?.message ?? r.stderr.trim()}`);
  return { log, pointer };
}

function parseArgs(argv, env = process.env) {
  const opts = { root: defaultRoot(env), run: env.FACTORY_RUN, cells: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--root' || argv[i] === '--run') {
      if (i + 1 >= argv.length) throw new DecideError(`${argv[i]} needs a value`);
      opts[argv[i].slice(2)] = argv[++i];
    } else opts.cells.push(argv[i]);
  }
  return opts;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const { log, pointer } = decide(parseArgs(process.argv.slice(2)));
    process.stdout.write(`decide: logged to ${log} with ${pointer}\n`);
  } catch (err) {
    process.stderr.write(`decide.mjs: ${err.message}\n`);
    process.exit(err instanceof DecideError ? 2 : 1);
  }
}
