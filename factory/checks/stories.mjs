#!/usr/bin/env node
// Story-map check (issue #60). A story map ties each user story of a spec to the stable names of
// the checks and tests that are its evidence, so every evidence link is an explicit, reviewable
// assertion. The check fails on a row that names a check or test that doesn't exist, naming the
// row, so the map can't silently rot. Writes one check event and exits 0 on pass, 1 on fail.
//
//   node factory/checks/stories.mjs [--root <repo>] [--run <id>] [--agent <id>] [--map <file>]...
//
// Maps: every factory/stories/<spec>.tsv under root, or each --map. Run and agent default as in
// check.mjs.
import { globSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkCli, shown } from './check.mjs';

// A check is named by its `check:<name>` script in package.json, which is also the name of the
// check event it writes. Ad hoc event names (`npm test`, `npm-test`) have no script, so they fail.
function checkScripts(root) {
  const scripts = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).scripts ?? {};
  return new Set(Object.keys(scripts).filter((s) => s.startsWith('check:')).map((s) => s.slice('check:'.length)));
}

// The test files `npm test` and CI run.
const TEST_FILES = 'factory/**/*.test.mjs';

// A test is named by the literal first argument of a test(), it(), describe(), suite() or
// t.test() call in a test file. A name built at run time (a template with `${…}`) is not stable,
// so it is never declared here.
const DECLARATION = /(?:^|[^\w$])(?:test|it|describe|suite)\s*\(\s*(?:'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\$]|\\.|\$(?!\{))*)`)/g;
const ESCAPES = { n: '\n', t: '\t', r: '\r' };
const unescape = (s) => s.replace(/\\(.)/gs, (_, c) => ESCAPES[c] ?? c);

function testNames(root) {
  const names = new Set();
  for (const f of globSync(TEST_FILES, { cwd: root })) {
    for (const m of readFileSync(join(root, f), 'utf8').matchAll(DECLARATION)) names.add(unescape(m[1] ?? m[2] ?? m[3]));
  }
  return names;
}

// The problems in one map, each naming its row as <file>:<line>.
function problemsIn(where, { header, rows }, known) {
  const problems = [];
  if (header !== HEADER) problems.push(`${where}:1: the header must be ${HEADER.split('\t').join(', ')}`);
  const evidenceAt = new Map();
  for (const r of rows) if (r.kind !== 'none' && !evidenceAt.has(r.story)) evidenceAt.set(r.story, r.line);
  for (const { line, story, kind, name } of rows) {
    const at = `${where}:${line}: story ${story}`;
    if (!/^[1-9]\d*$/.test(story)) problems.push(`${at}: the story must be a number`);
    if (!KINDS.includes(kind)) problems.push(`${at}: kind ${kind} is not ${KINDS.slice(0, -1).join(', ')} or ${KINDS.at(-1)}`);
    else if (!name) problems.push(`${at}: no name`);
    else if (kind === 'none' && name !== '-') problems.push(`${at}: a none row's name is -`);
    else if (kind === 'none' && evidenceAt.has(story)) problems.push(`${at}: marked none, but line ${evidenceAt.get(story)} names evidence`);
    else if (kind === 'check' && !known.checks.has(name)) problems.push(`${at}: check ${name} is not a check:* script in package.json`);
    else if (kind === 'test' && !known.tests.has(name)) problems.push(`${at}: test "${name}" is declared in no ${TEST_FILES}`);
  }
  return problems;
}

// A map is a TSV with this header. Each row links one story to one piece of evidence: a check by
// its script name, a test by its name, or `none` (name `-`) for a story with no evidence, which
// stays in the map because that gap is the point.
const HEADER = 'story\tkind\tname';
const KINDS = ['check', 'test', 'none'];

// A map's header and its rows, with their line numbers.
function readMap(file) {
  const [header, ...lines] = readFileSync(file, 'utf8').split(/\r?\n/);
  const rows = lines.map((text, i) => {
    const [story, kind, name] = text.split('\t');
    return { line: i + 2, text, story, kind, name };
  }).filter((r) => r.text !== '');
  return { header, rows };
}

function runCheck(opts) {
  const files = opts.map;
  const known = { checks: checkScripts(opts.root), tests: testNames(opts.root) };
  const maps = files.map((f) => ({ where: shown(opts.root, f), map: readMap(f) }));
  const problems = maps.flatMap((m) => problemsIn(m.where, m.map, known));
  const rows = maps.reduce((n, m) => n + m.map.rows.length, 0);
  const where = `${files.length} story map${files.length === 1 ? '' : 's'} (${rows} row${rows === 1 ? '' : 's'})`;
  return { where, ok: 'every named check and test exists', problems };
}

checkCli(import.meta.url, {
  name: 'stories',
  usage: 'node factory/checks/stories.mjs [--root <repo>] [--run <id>] [--agent <id>] [--map <file>]...',
  options: { map: 'list' },
}, (opts) => runCheck({ ...opts, map: opts.map ?? mapFiles(opts.root) }));

function mapFiles(root) {
  const dir = join(root, 'factory', 'stories');
  try {
    return readdirSync(dir).filter((f) => f.endsWith('.tsv')).sort().map((f) => join(dir, f));
  } catch {
    return [];
  }
}
