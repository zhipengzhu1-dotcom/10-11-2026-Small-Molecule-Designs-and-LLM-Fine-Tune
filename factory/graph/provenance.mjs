// The provenance overlay of the node model (spec #52, story 36; issue #69), behind buildGraph's
// interface. Pure, with no imports, like graph.mjs.
//
// v1 answers the two questions the spec names (Implementation Decisions, Provenance):
//   writtenTwice(paths?) -> [{ path, agents, writes }]
//       files that `artifact` events of two or more agents generated: two versions of one path,
//       the OPM "one wasGeneratedBy per artifact" break the research found on the real stream. An
//       agent rewriting its own file is one line of work and is not reported.
//   staleChecks(paths?) -> [{ check, name, result, path, write }]
//       checks that ran before their file's last write: the latest `check` of each name whose
//       evidence names the file, when a write of the file comes after it. `write` is the last one.
// `paths`, when given, narrows both to those repo-relative paths (a merge's changed files); an
// artifact logged by an absolute path inside the repo matches its repo-relative path too.
//
// A check concerns a file when its evidence names the file's path as a whole path, with or without
// a `file:` prefix or a `:<line>` suffix. "Built on a file outside the commit" waits for `used=` on
// artifact events (spec #52, Further Notes).
//
// Order is the stream's: activity nodes come in the order readStream gives events, which keeps
// each agent's events in file order.

const slash = (p) => p.replace(/\\/g, '/');

// Whether `text` names `path` as a whole path, not as part of a longer one.
function names(text, path) {
  for (let i = text.indexOf(path); i >= 0; i = text.indexOf(path, i + 1)) {
    if (!/[\w./-]/.test(text[i - 1] ?? ' ') && !/[\w/-]/.test(text[i + path.length] ?? ' ')) return true;
  }
  return false;
}

export function provenanceOverlay(graph) {
  const activities = graph.nodes.filter((n) => n.class === 'activity');
  const position = new Map(activities.map((n, i) => [n.id, i]));
  const writes = activities.filter((n) => n.type === 'artifact' && n.event.path);
  const checks = activities.filter((n) => n.type === 'check');

  // The writes of each file, keyed by the given path a write matches, else by its own path.
  const byFile = (paths) => {
    const files = new Map();
    for (const w of writes) {
      const own = slash(w.event.path);
      const keys = paths ? paths.map(slash).filter((p) => own === p || own.endsWith(`/${p}`)) : [own];
      for (const k of keys) files.has(k) ? files.get(k).push(w) : files.set(k, [w]);
    }
    return files;
  };

  const writtenTwice = (paths) => {
    const out = [];
    for (const [path, ws] of byFile(paths)) {
      const agents = [...new Set(ws.map((w) => w.event.agent))];
      if (agents.length > 1) out.push({ path, agents, writes: ws.map((w) => w.id) });
    }
    return out;
  };

  const staleChecks = (paths) => {
    const out = [];
    for (const [path, ws] of byFile(paths)) {
      const last = ws.at(-1);
      const latest = new Map(); // check name -> its latest run naming the file
      for (const c of checks) if (names(String(c.event.evidence ?? ''), path)) latest.set(c.event.name, c);
      for (const [name, c] of latest) {
        if (position.get(c.id) < position.get(last.id)) out.push({ check: c.id, name, result: c.event.result, path, write: last.id });
      }
    }
    return out.sort((a, b) => position.get(a.check) - position.get(b.check));
  };

  return { writtenTwice, staleChecks };
}
