import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readStream } from '../read.mjs';
import { FACTORY, tempRoot } from './helpers.mjs';

const CHECK = join(FACTORY, 'checks', 'tables.mjs');
const FIXTURE = join(FACTORY, 'test', 'fixtures', 'tables');

// Copies the hand-made fixture set (paper.tex + notes/) into a temp dir. Each edit is
// [file, from, to], a literal replacement that must hit, so a broken set is broken on purpose.
function sample(edits = []) {
  const dir = tempRoot();
  cpSync(FIXTURE, dir, { recursive: true });
  for (const [file, from, to] of edits) {
    const p = join(dir, file);
    const text = readFileSync(p, 'utf8');
    assert.ok(text.includes(from), `fixture edit: ${from} not in ${file}`);
    writeFileSync(p, text.replace(from, to));
  }
  return dir;
}

// Runs the check the way an agent does, logging into a separate temp factory root.
function check(dir) {
  const root = tempRoot();
  const env = { ...process.env };
  for (const k of ['FACTORY_ROOT', 'FACTORY_RUN', 'FACTORY_AGENT', 'CLAUDE_PROJECT_DIR']) delete env[k];
  const r = spawnSync(
    process.execPath,
    [CHECK, '--tex', join(dir, 'paper.tex'), '--notes', join(dir, 'notes'), '--root', root, '--run', 'run-1', '--agent', 'checker'],
    { env, encoding: 'utf8' },
  );
  const events = readStream(root).filter((e) => e.type === 'check');
  return { ...r, events };
}

test('a matching set of notes passes and records a pass check event', () => {
  const r = check(sample());
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.events.length, 1);
  const [e] = r.events;
  assert.equal(e.name, 'tables');
  assert.equal(e.result, 'pass');
  assert.equal(e.agent, 'checker');
  assert.equal(e.run, 'run-1');
  // The report says what each PASS rests on, so a note-only pass is not mistaken for a compared table.
  assert.match(r.stdout, /PASS tab:toy \(3 rows with numbers compared\)/);
  assert.match(r.stdout, /PASS fig:curve \(note found; no tabular\)/);
});

test('one wrong cell fails, and the evidence names the table, row and column', () => {
  const r = check(sample([['notes/tables/toy.md', '| 41.5 |', '| 14.5 |']]));
  assert.equal(r.status, 1, r.stdout + r.stderr);
  const [e] = r.events;
  assert.equal(e.result, 'fail');
  assert.match(e.evidence, /tab:toy/);
  assert.match(e.evidence, /Beta-2/); // row label from the source
  assert.match(e.evidence, /col 2/);
  assert.match(e.evidence, /source 41\.5/);
  assert.match(e.evidence, /notes 14\.5/);
  assert.doesNotMatch(e.evidence, /tab:budget/);
});

test('a row missing from the notes fails with both row counts', () => {
  const r = check(sample([['notes/tables/toy.md', '| Alpha | 12.5 | **80%** |\n', '']]));
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.events[0].evidence, /tab:toy: source has 3 rows with numbers, notes .* have 2/);
});

for (const [label, file] of [['tab:toy', 'notes/tables/toy.md'], ['fig:curve', 'notes/figures/curve.md']]) {
  test(`${label} with no note fails, and the evidence names ${label}`, () => {
    const r = check(sample([[file, `Label: \`${label}\``, 'Label: `none:here`']]));
    assert.equal(r.status, 1, r.stdout + r.stderr);
    const [e] = r.events;
    assert.equal(e.result, 'fail');
    assert.match(e.evidence, new RegExp(`no note for ${label}\\b`));
  });
}

test('a float is named by the label after its caption, not by labels in subfigures or body text', () => {
  const fig = '\\begin{figure}\n\\subfigure[Left\\label{fig:left}]{x}\n\\caption{Whole.}\n\\label{fig:whole}\nSee \\label{eq:inner}.\n\\end{figure}\n';
  const r = check(sample([['paper.tex', '\\end{document}', `${fig}\\end{document}`]]));
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.events[0].evidence, /no note for fig:whole\b/);
});

test('a table the check cannot parse is INCONCLUSIVE and never recorded as a pass', () => {
  // A column type defined elsewhere with \newcolumntype: the check cannot know its width.
  const r = check(sample([['paper.tex', '\\begin{tabular}{lrr}', '\\begin{tabular}{lrQ}']]));
  assert.equal(r.status, 3, r.stdout + r.stderr);
  assert.match(r.stdout, /INCONCLUSIVE tab:toy/);
  const [e] = r.events;
  assert.equal(e.result, 'fail');
  assert.equal(e.verdict, 'inconclusive');
  assert.match(e.evidence, /tab:toy/);
  assert.doesNotMatch(e.evidence, /tab:budget/);
});
