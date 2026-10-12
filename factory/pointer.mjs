// The evidence pointer grammar, the one parser for it, and the one resolver. The decision writer
// (decide.mjs), the trail check (checks/trail.mjs) and the audit (audit.mjs) all use this module,
// so the factory has one grammar (spec #52, stories 17, 18 and 20). The grammar and its parsers,
// parsePointer and parseTarget, live in the pure pointer-grammar.mjs, which code that must touch no
// file (the graph module) imports directly; this module re-exports them and adds the resolver.
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { gitRun } from './git.mjs';

export { parsePointer, parseTarget } from './pointer-grammar.mjs';

// Why a file pointer's line range falls outside a file's text, or null. `text` is read lazily.
export function lineProblem(p, text) {
  if (!p.from) return null;
  const lines = text().replace(/\r?\n$/, '').split(/\r?\n/).length;
  return p.to > lines ? `${p.text} is past the end of the file (${lines} lines)` : null;
}

// Transcripts run to megabytes and many pointers name the same one, so each is read once.
const transcripts = new Map();
function transcript(file) {
  if (!transcripts.has(file)) transcripts.set(file, readFileSync(file, 'utf8'));
  return transcripts.get(file);
}

// Whether parsed pointer `p` resolves now: null when it does, else { problem }. A repo file that is
// missing or too short also gets `changed: true`, since it may have resolved when it was cited.
// `root` is the repo, `transcripts` the Claude Code transcripts folder and `home` what ~/ means.
// issue: and url: need the network, so they are taken as given.
export function resolvePointer(p, { root, transcripts: dir, home: homeDir = homedir() }) {
  if (p.problem) return { problem: p.problem };
  if (p.kind === 'file') {
    const home = p.path.startsWith('~/');
    const full = home ? join(homeDir, p.path.slice(2)) : join(root, p.path);
    if (!existsSync(full)) return { problem: `${p.text} does not exist`, changed: !home };
    if (!home && gitRun(root, 'check-ignore', '-q', p.path).status === 0) {
      return { problem: `${p.text} is gitignored; cite a tracked file, commit or transcript instead` };
    }
    const problem = lineProblem(p, () => readFileSync(full, 'utf8'));
    return problem ? { problem, changed: !home } : null;
  }
  if (p.kind === 'commit') {
    return gitRun(root, 'cat-file', '-e', `${p.sha}^{commit}`).status === 0 ? null : { problem: `${p.text} is not a commit` };
  }
  if (p.kind === 'transcript') {
    const file = join(dir, `${p.session}.jsonl`);
    if (!existsSync(file)) return { problem: `${p.text} does not exist` };
    return transcript(file).includes(`"timestamp":"${p.at}`) ? null : { problem: `${p.text} has no line at that time` };
  }
  return null;
}
