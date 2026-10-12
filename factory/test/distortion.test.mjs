import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eigenmap, euclidean, neighbourhoods } from '../graph/distortion.mjs';

// A seeded generator (mulberry32), so the fixture vectors are the same on every run.
function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const cloud = (n, d, seed) => {
  const r = random(seed);
  return Array.from({ length: n }, () => Array.from({ length: d }, () => r()));
};

test('T(k) and C(k) score 1 for an identity projection', () => {
  const points = cloud(60, 8, 1);
  const s = neighbourhoods(euclidean(points), euclidean(points));
  assert.deepEqual(s, { T: { 5: 1, 10: 1 }, C: { 5: 1, 10: 1 } });
});

test('T(k) and C(k) score near the random baseline for a shuffled projection', () => {
  const n = 200;
  const points = cloud(n, 8, 2);
  const r = random(3);
  const shuffled = [...points];
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const s = neighbourhoods(euclidean(points), euclidean(shuffled));
  // A random view's k-NN are k random points; those outside the true k-NN have ranks spread
  // evenly over k+1 .. n-1, so the expected score is 1 - (n-1-k)^2 / ((n-1)(2n-3k-1)).
  for (const k of [5, 10]) {
    const baseline = 1 - (n - 1 - k) ** 2 / ((n - 1) * (2 * n - 3 * k - 1));
    assert.ok(Math.abs(s.T[k] - baseline) < 0.03, `T(${k}) ${s.T[k]} vs baseline ${baseline}`);
    assert.ok(Math.abs(s.C[k] - baseline) < 0.03, `C(${k}) ${s.C[k]} vs baseline ${baseline}`);
  }
});

test('T(1) and C(1) of a worked example: two points swapped on a line', () => {
  // Data on a line at 0, 1, 3, 7, 15; the view swaps the first and last. By hand: three points
  // get a false nearest neighbour, of true rank 3, 4 and 3, so T(1) = 1 - 2/(5*1*6) * (2+3+2);
  // the same three lose their true one, of view rank 3, 4 and 3, so C(1) is the same.
  const s = neighbourhoods(euclidean([[0], [1], [3], [7], [15]]), euclidean([[15], [1], [3], [7], [0]]), [1]);
  assert.ok(Math.abs(s.T[1] - 8 / 15) < 1e-12, String(s.T[1]));
  assert.ok(Math.abs(s.C[1] - 8 / 15) < 1e-12, String(s.C[1]));
});

test('a k of half the points or more has no score, since the measure is only normalised below n/2', () => {
  const points = cloud(12, 3, 4);
  const s = neighbourhoods(euclidean(points), euclidean(points));
  assert.deepEqual(s, { T: { 5: 1, 10: null }, C: { 5: 1, 10: null } });
});

test('the Laplacian eigenmap of a path orders its nodes along the path', () => {
  // The first non-trivial eigenvector of a path graph is a cosine along it, so strictly monotone.
  const xs = eigenmap(8, [[3, 4], [0, 1], [1, 2], [2, 3], [4, 5], [5, 6], [6, 7]], 1).map(([x]) => x);
  const up = xs[7] > xs[0] ? xs : xs.map((x) => -x);
  for (let i = 1; i < 8; i++) assert.ok(up[i] > up[i - 1], xs.join(' '));
});

test('the 2-D Laplacian eigenmap of a cycle is a regular polygon', () => {
  // A cycle's first two non-trivial eigenvectors are cos and sin of 2 pi i / n.
  const n = 9;
  const ps = eigenmap(n, Array.from({ length: n }, (_, i) => [i, (i + 1) % n]), 2);
  const r = ps.map(([x, y]) => Math.hypot(x, y));
  const side = ps.map(([x, y], i) => Math.hypot(x - ps[(i + 1) % n][0], y - ps[(i + 1) % n][1]));
  for (const v of r) assert.ok(Math.abs(v / r[0] - 1) < 1e-9, `radii ${r.join(' ')}`);
  for (const v of side) assert.ok(Math.abs(v / side[0] - 1) < 1e-9, `sides ${side.join(' ')}`);
});

test('an eigenmap asked for more dimensions than the graph has gives n - 1', () => {
  assert.deepEqual(eigenmap(3, [[0, 1], [1, 2]], 16).map((p) => p.length), [2, 2, 2]);
});
