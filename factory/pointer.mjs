// The evidence pointer grammar, the one parser for it, and the one resolver. The decision writer
// (decide.mjs), the trail check (checks/trail.mjs) and the audit (audit.mjs) all use this module,
// so the factory has one grammar (spec #52, stories 17, 18 and 20):
//
//   file:<path>[:<line>[-<line>]]   repo-relative, or ~/ for the home folder
//   commit:<sha>                    7 to 40 hex digits
//   transcript:<session>@<iso>      a session id and an ISO time prefix of one of its entries
//   issue:<n>                       a GitHub issue of this repo
//   url:<url>                       an http(s) URL
//
// Text is a pointer when it starts with `<lowercase word>:` and a value; anything else is prose.
// A challenge's target takes two more forms, row:<N> and event:<run>/<agent>:<line> (parseTarget).
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { gitRun } from './git.mjs';

const KIND = /^([a-z]+):(\S.*)$/;
const ISO = /^\d{4}-\d{2}-\d{2}(T[\d:.]*Z?)?$/;

// The parts of pointer `text`: { kind, text, ...parts }, or { kind, text, problem } when its kind
// is unknown or its value malformed. Null when `text` is prose, not a pointer.
export function parsePointer(text) {
  const m = KIND.exec(text);
  if (!m) return null;
  const [, kind, value] = m;
  const bad = (problem) => ({ kind, text, problem });
  if (kind === 'file') {
    const [, path, from, to] = /^(.*?)(?::(\d+)(?:-(\d+))?)?$/.exec(value);
    return from ? { kind, text, path, from: Number(from), to: Number(to ?? from) } : { kind, text, path };
  }
  if (kind === 'commit') {
    return /^[0-9a-f]{7,40}$/.test(value) ? { kind, text, sha: value } : bad(`${text} is not a commit (7 to 40 hex digits)`);
  }
  if (kind === 'transcript') {
    const [session, at, ...rest] = value.split('@');
    return session && ISO.test(at ?? '') && !rest.length ? { kind, text, session, at }
      : bad(`${text} has no @<ISO time>; write transcript:<session>@<ISO time>`);
  }
  if (kind === 'issue') return /^\d+$/.test(value) ? { kind, text, number: Number(value) } : bad(`${text} is not an issue number`);
  if (kind === 'url') return /^https?:\/\/\S+$/.test(value) ? { kind, text, url: value } : bad(`${text} is not an http(s) URL`);
  if (kind === 'http' || kind === 'https') return bad(`unknown pointer ${text}; write url:${text}`);
  return bad(`unknown pointer ${text}`);
}

// The parts of a challenge's target (issue #58): any pointer above, or one of two forms that only
// a target takes, since they name the factory's own logs rather than evidence for a decision:
//
//   row:<N>                         line N of the decision log
//   event:<run>/<agent>:<line>      line <line> of factory/agents/<run>/<agent>.jsonl
//
// Same return shape as parsePointer; null when `text` is prose.
const NAME = '[A-Za-z0-9][A-Za-z0-9._-]*';
const EVENT = new RegExp(`^(${NAME})/(${NAME}):([1-9]\\d*)$`);

export function parseTarget(text) {
  const m = KIND.exec(text);
  if (m?.[1] === 'row') {
    return /^[1-9]\d*$/.test(m[2]) ? { kind: 'row', text, line: Number(m[2]) }
      : { kind: 'row', text, problem: `${text} is not a decision row; write row:<line number>` };
  }
  if (m?.[1] === 'event') {
    const e = EVENT.exec(m[2]);
    return e ? { kind: 'event', text, run: e[1], agent: e[2], line: Number(e[3]) }
      : { kind: 'event', text, problem: `${text} is not an event; write event:<run>/<agent>:<line>` };
  }
  return parsePointer(text);
}

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
