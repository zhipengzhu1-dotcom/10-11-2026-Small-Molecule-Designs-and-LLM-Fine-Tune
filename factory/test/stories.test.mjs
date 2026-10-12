import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { readStream } from '../read.mjs';
import { FACTORY, tempRoot } from './helpers.mjs';

const CHECK = join(FACTORY, 'checks', 'stories.mjs');

// A repo in a temp root: package.json with two check scripts and one test file declaring four
// tests, plus the given story maps under factory/stories/.
function repo(maps) {
  const root = tempRoot();
  const put = (path, text) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  put('package.json', JSON.stringify({ scripts: { test: 'node --test', 'check:trail': 'x', 'check:ticket': 'x', ci: 'x' } }));
  put('factory/test/sample.test.mjs', [
    "import { test, describe, it } from 'node:test';",
    "test('a trail with every row audited passes', () => {});",
    'test("the page cannot be reached from another machine\'s address", () => {});',
    "describe('decide', () => { it('writes one row', () => {}); });",
    "test('outer', async (t) => { await t.test('a nested step', () => {}); });",
    'for (const n of [1, 2]) test(`generated ${n}`, () => {});',
  ].join('\n'));
  for (const [name, text] of Object.entries(maps)) put(join('factory', 'stories', name), text);
  return root;
}

function check(root, extra = []) {
  const r = spawnSync(process.execPath, [CHECK, '--root', root, '--run', 'run-1', '--agent', 'mapper', ...extra], { encoding: 'utf8' });
  const events = readStream(root).filter((e) => e.type === 'check');
  return { ...r, events };
}

const HEADER = 'story\tkind\tname\n';

test('a story-map row naming a check that is no check:* script fails, naming the row', () => {
  const root = repo({ '52.tsv': HEADER + '21\tcheck\ttrail\n22\tcheck\tnpm-test\n' });
  const r = check(root);
  assert.equal(r.status, 1, r.stderr + r.stdout);
  assert.deepEqual(r.events.map((e) => [e.run, e.agent, e.name, e.result]), [['run-1', 'mapper', 'stories', 'fail']]);
  assert.match(r.events[0].evidence, /factory\/stories\/52\.tsv:3: story 22: check npm-test is not a check:\* script in package\.json/);
  assert.doesNotMatch(r.events[0].evidence, /52\.tsv:2/);
});

test('a story-map row naming a test that no test file declares fails, naming the row', () => {
  const root = repo({ '52.tsv': HEADER + '22\ttest\ta trail with every row audited passes\n22\ttest\ta test nobody wrote\n' });
  const r = check(root);
  assert.equal(r.status, 1, r.stderr + r.stdout);
  assert.match(r.events[0].evidence, /factory\/stories\/52\.tsv:3: story 22: test "a test nobody wrote" is declared in no factory\/\*\*\/\*\.test\.mjs/);
  assert.doesNotMatch(r.events[0].evidence, /52\.tsv:2/);
});

test('a map naming real checks and tests, nested and quoted ones included, passes', () => {
  const rows = [
    '21\tcheck\ttrail',
    "22\ttest\tthe page cannot be reached from another machine's address",
    '22\ttest\twrites one row',
    '22\ttest\tdecide',
    '23\ttest\ta nested step',
  ];
  const root = repo({ '52.tsv': HEADER + rows.join('\n') + '\n' });
  const r = check(root);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.equal(r.events[0].result, 'pass');
  assert.match(r.events[0].evidence, /^1 story map \(5 rows\); every named check and test exists$/);
});

test('a story with no evidence is a none row, which passes unless the story also has evidence', () => {
  const ok = check(repo({ '1.tsv': HEADER + '18\tnone\t-\n19\tcheck\ttrail\n' }));
  assert.equal(ok.status, 0, ok.stderr + ok.stdout);
  const both = check(repo({ '1.tsv': HEADER + '18\tnone\t-\n18\tcheck\ttrail\n' }));
  assert.equal(both.status, 1, both.stderr + both.stdout);
  assert.match(both.events[0].evidence, /factory\/stories\/1\.tsv:2: story 18: marked none, but line 3 names evidence/);
});

test('a malformed map fails, naming the header or each bad row', () => {
  const rows = ['x\tcheck\ttrail', '7\tsolution\ttrail', '8\tcheck', '9\tnone\tnothing'];
  const r = check(repo({ '1.tsv': 'story\tname\n', '2.tsv': HEADER + rows.join('\n') + '\n' }));
  assert.equal(r.status, 1, r.stderr + r.stdout);
  const e = r.events[0].evidence;
  assert.match(e, /factory\/stories\/1\.tsv:1: the header must be story, kind, name/);
  assert.match(e, /2\.tsv:2: story x: the story must be a number/);
  assert.match(e, /2\.tsv:3: story 7: kind solution is not check, test or none/);
  assert.match(e, /2\.tsv:4: story 8: no name/);
  assert.match(e, /2\.tsv:5: story 9: a none row's name is -/);
});

test('a test declared through a wrapper of test() is named like any other; a helper that only takes a string is not', () => {
  const root = repo({ '52.tsv': HEADER + '23\ttest\ta wrapped test\n24\ttest\ta wrapped function test\n25\ttest\tnot a test\n' });
  writeFileSync(join(root, 'factory', 'test', 'wrapped.test.mjs'), [
    "import { test } from 'node:test';",
    "const t = (name, fn) => test(name, { skip: false }, fn);",
    "function wrapped(title, fn) { return test(title, fn); }",
    "const u = (s) => s.length;",
    "t('a wrapped test', () => {});",
    "wrapped('a wrapped function test', () => {});",
    "u('not a test');",
  ].join('\n'));
  const r = check(root);
  assert.equal(r.status, 1, r.stderr + r.stdout);
  assert.doesNotMatch(r.events[0].evidence, /52\.tsv:[23]:/);
  assert.match(r.events[0].evidence, /52\.tsv:4: story 25: test "not a test" is declared in no/);
});

test('a generated test name is not stable, so the map cannot name it', () => {
  const r = check(repo({ '52.tsv': HEADER + '22\ttest\tgenerated 1\n' }));
  assert.equal(r.status, 1, r.stderr + r.stdout);
  assert.match(r.events[0].evidence, /52\.tsv:2: story 22: test "generated 1" is declared in no/);
});
