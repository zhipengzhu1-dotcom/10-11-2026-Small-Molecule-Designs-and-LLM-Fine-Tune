import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readMarker } from '../run-marker.mjs';
import { marker, tempRoot } from './helpers.mjs';

// A merge script reads the active run and its integration branch from the marker.
test('the run marker gives the active run and its integration branch, and nothing once cleared', () => {
  const root = tempRoot();
  assert.equal(readMarker(root), null);

  const s = marker(['start', '--root', root, '--run', 'run-1', '--branch', 'spec1/leftovers']);
  assert.equal(s.status, 0, s.stderr);
  assert.deepEqual(readMarker(root), { run: 'run-1', branch: 'spec1/leftovers' });

  const t = marker(['stop', '--root', root]);
  assert.equal(t.status, 0, t.stderr);
  assert.equal(readMarker(root), null);
});

test('the run comes from FACTORY_RUN when --run is not passed', () => {
  const root = tempRoot();
  const s = marker(['start', '--root', root, '--branch', 'spec1/leftovers'], { FACTORY_RUN: 'run-env' });
  assert.equal(s.status, 0, s.stderr);
  assert.equal(readMarker(root).run, 'run-env');
});

test('starting a run without its integration branch fails and leaves no marker', () => {
  const root = tempRoot();
  const s = marker(['start', '--root', root, '--run', 'run-1']);
  assert.notEqual(s.status, 0);
  assert.match(s.stderr, /--branch/);
  assert.equal(readMarker(root), null);
});
