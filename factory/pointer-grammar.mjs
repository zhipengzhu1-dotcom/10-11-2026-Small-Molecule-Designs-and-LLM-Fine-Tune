// The evidence pointer grammar and its one parser: the pure half of factory/pointer.mjs, which
// re-exports it and adds the resolver. Pure, with no imports at all, so the graph module
// (graph.mjs) can use it; the graph module's purity test covers this file too.
//
//   file:<path>[:<line>[-<line>]]   repo-relative, or ~/ for the home folder
//   commit:<sha>                    7 to 40 hex digits
//   transcript:<session>@<iso>      a session id and an ISO time prefix of one of its entries
//   issue:<n>                       a GitHub issue of this repo
//   url:<url>                       an http(s) URL
//
// Text is a pointer when it starts with `<lowercase word>:` and a value; anything else is prose.
// A challenge's target takes two more forms, row:<N> and event:<run>/<agent>:<line> (parseTarget).

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
//
// NAME is the run and agent id rule (log.mjs plainName writes ids to it); the causal overlay
// (graph/causal.mjs) finds citations with it too, so a cited id parses the same everywhere.
export const NAME = '[A-Za-z0-9][A-Za-z0-9._-]*';
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

// The parts of an item of a decision row's evidence (decide.mjs): any pointer, or one of the two
// that name the factory's own logs, so a row can cite the hand-back it acts on:
//
//   event:<run>/<agent>:<line>      as in a challenge's target
//   agent:<id>                      an agent of the stream, by its id
//
// Same return shape as parsePointer; null when `text` is prose.
export function parseEvidence(text) {
  const m = KIND.exec(text);
  if (m?.[1] === 'event') return parseTarget(text);
  if (m?.[1] === 'agent') {
    return new RegExp(`^${NAME}$`).test(m[2]) ? { kind: 'agent', text, agent: m[2] }
      : { kind: 'agent', text, problem: `${text} is not an agent; write agent:<id>` };
  }
  return parsePointer(text);
}
