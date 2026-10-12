import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePointer } from '../pointer.mjs';

test('each pointer kind of the grammar parses into its parts', () => {
  assert.deepEqual(parsePointer('file:notes/source.md'), { kind: 'file', text: 'file:notes/source.md', path: 'notes/source.md' });
  assert.deepEqual(parsePointer('file:notes/source.md:2'), { kind: 'file', text: 'file:notes/source.md:2', path: 'notes/source.md', from: 2, to: 2 });
  assert.deepEqual(parsePointer('file:~/.claude/CLAUDE.md:3-9'), { kind: 'file', text: 'file:~/.claude/CLAUDE.md:3-9', path: '~/.claude/CLAUDE.md', from: 3, to: 9 });
  assert.deepEqual(parsePointer('commit:4beca44'), { kind: 'commit', text: 'commit:4beca44', sha: '4beca44' });
  assert.deepEqual(parsePointer('transcript:sess-1@2026-10-11T10:00:00'),
    { kind: 'transcript', text: 'transcript:sess-1@2026-10-11T10:00:00', session: 'sess-1', at: '2026-10-11T10:00:00' });
  assert.deepEqual(parsePointer('issue:44'), { kind: 'issue', text: 'issue:44', number: 44 });
  assert.deepEqual(parsePointer('url:https://example.org/a?b=c'), { kind: 'url', text: 'url:https://example.org/a?b=c', url: 'https://example.org/a?b=c' });
});

test('a pointer of an unknown kind, or a known kind with a malformed value, parses to a problem naming it', () => {
  const problem = (text) => parsePointer(text).problem;
  assert.equal(problem('doc:whatever'), 'unknown pointer doc:whatever');
  assert.equal(problem('https://example.org'), 'unknown pointer https://example.org; write url:https://example.org');
  assert.equal(problem('commit:abcdefg'), 'commit:abcdefg is not a commit (7 to 40 hex digits)');
  assert.equal(problem('commit:abc'), 'commit:abc is not a commit (7 to 40 hex digits)');
  assert.equal(problem('transcript:sess-1'), 'transcript:sess-1 has no @<ISO time>; write transcript:<session>@<ISO time>');
  assert.equal(problem('transcript:sess-1@10:00:00Z'), 'transcript:sess-1@10:00:00Z has no @<ISO time>; write transcript:<session>@<ISO time>');
  assert.equal(problem('issue:#44'), 'issue:#44 is not an issue number');
  assert.equal(problem('url:example.org'), 'url:example.org is not an http(s) URL');
});

test('text with no `<kind>:` prefix is prose, not a pointer', () => {
  for (const prose of ['issue #1 sub-issues', 'merge 1945810', 'commit 271c5ba', 'note: see above', 'file:',
    '~/.claude/projects/x/sess-1.jsonl @05:06:41Z', 'C:/Users/x/notes.md', '']) {
    assert.equal(parsePointer(prose), null, prose);
  }
});
