import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scatterView } from '../graph/scatter.mjs';

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
// Sparse vectors as the text overlay holds them: a Map from term to weight, zeros left out.
const sparse = (dense) => new Map(dense.flatMap((x, c) => (x ? [[`t${c}`, x]] : [])));
// Fixture "TF-IDF" vectors: nonnegative, about a third of the terms used, each L2-normalised.
function fixture(n, d, seed) {
  const r = random(seed);
  return Array.from({ length: n }, () => {
    const v = Array.from({ length: d }, () => (r() < 0.35 ? r() : 0));
    const norm = Math.hypot(...v) || 1;
    return v.map((x) => x / norm);
  });
}

const dist = (a, b) => Math.hypot(...a.map((x, i) => x - b[i]));

// Venna and Kaski's M1 written out from the paper (WSOM 2005, eq. 1), independently of the module:
// U_k(i) is the set of points in i's k-neighbourhood in the view but not in the data, r(i, j) the
// rank of j from i in the data. Continuity (eq. 2) is the same with the two spaces swapped. The
// paper leaves ties open; distances equal to 9 decimals tie here and go by index, as the module's
// do (rows that share no term are all sqrt(2) apart).
function m1(data, view, k) {
  const n = data.length;
  const rankFrom = (pts, i) => {
    const order = pts.map((p, j) => [Math.round(dist(pts[i], p) * 1e9), j]).filter(([, j]) => j !== i).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    return new Map(order.map(([, j], p) => [j, p + 1]));
  };
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const rData = rankFrom(data, i), rView = rankFrom(view, i);
    for (let j = 0; j < n; j++) if (j !== i && rView.get(j) <= k && rData.get(j) > k) sum += rData.get(j) - k;
  }
  return 1 - (2 / (n * k * (2 * n - 3 * k - 1))) * sum;
}

test("the PCA scatter's T(k) and C(k) at k = 5 and 10 match a direct computation on fixture vectors", () => {
  const dense = fixture(40, 30, 7);
  const view = scatterView(dense.map(sparse));
  assert.equal(view.method, 'pca');
  assert.equal(view.n, 40);
  const shown = view.points.map((p) => [p.x, p.y]);
  for (const k of [5, 10]) {
    assert.ok(Math.abs(view.T[k] - m1(dense, shown, k)) < 1e-12, `T(${k}) ${view.T[k]} vs ${m1(dense, shown, k)}`);
    assert.ok(Math.abs(view.C[k] - m1(shown, dense, k)) < 1e-12, `C(${k}) ${view.C[k]} vs ${m1(shown, dense, k)}`);
  }
  // a real projection of 30 dimensions loses something, and is far better than random
  assert.ok(view.T[10] < 1 && view.T[10] > 0.6, String(view.T[10]));
});

test('vectors that lie on a plane come out at their true distances, so the PCA scatter scores 1', () => {
  // twelve points of a plane (no tied distances), set in 6 dimensions along two orthogonal
  // directions, then shifted
  const u = [1, 2, 0, 0, 2, 0].map((x) => x / 3), w = [0, 0, 3, 4, 0, 0].map((x) => x / 5);
  const r = random(11);
  const flat = [[0, 0.3], [4.5, 1], [2, 0], [1, 1.4], ...Array.from({ length: 8 }, () => [0.2 + 4 * r(), 0.1 + 1.2 * r()])];
  const dense = flat.map(([a, b]) => u.map((x, c) => 0.25 + a * x + b * w[c]));
  const view = scatterView(dense.map(sparse));
  const shown = view.points.map((p) => [p.x, p.y]);
  for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) assert.ok(Math.abs(dist(shown[i], shown[j]) - dist(flat[i], flat[j])) < 1e-9);
  assert.deepEqual({ T: view.T, C: view.C }, { T: { 5: 1, 10: null }, C: { 5: 1, 10: null } });
  // the axes are principal: centred, uncorrelated, and the first carries the most variance
  const mean = (f) => shown.reduce((s, p) => s + f(p), 0) / shown.length;
  assert.ok(Math.abs(mean((p) => p[0])) < 1e-9 && Math.abs(mean((p) => p[1])) < 1e-9);
  assert.ok(Math.abs(mean((p) => p[0] * p[1])) < 1e-9);
  assert.ok(mean((p) => p[0] ** 2) > mean((p) => p[1] ** 2));
});

test('the same vectors always give the same picture', () => {
  const vectors = fixture(25, 20, 3).map(sparse);
  assert.deepEqual(scatterView(vectors), scatterView(vectors));
});

test('PCA carries no warning; UMAP, asked for, carries its small-data warning and its own T(k) and C(k)', () => {
  const dense = fixture(40, 30, 7);
  const vectors = dense.map(sparse);
  assert.equal(scatterView(vectors).warning, null);
  const view = scatterView(vectors, { method: 'umap' });
  assert.equal(view.method, 'umap');
  assert.match(view.warning, /500/);
  assert.match(view.warning, /\b40 rows\b/);
  const shown = view.points.map((p) => [p.x, p.y]);
  assert.ok(shown.flat().every(Number.isFinite));
  for (const k of [5, 10]) {
    assert.ok(Math.abs(view.T[k] - m1(dense, shown, k)) < 1e-12);
    assert.ok(Math.abs(view.C[k] - m1(shown, dense, k)) < 1e-12);
  }
  assert.deepEqual(scatterView(vectors, { method: 'umap' }), view);
});

test('UMAP keeps two clusters of rows apart', () => {
  // two topics: rows 0-14 use terms 0-9, rows 15-29 use terms 10-19
  const r = random(5);
  const dense = Array.from({ length: 30 }, (_, i) => {
    const v = Array.from({ length: 20 }, (_, c) => ((c < 10) === (i < 15) && r() < 0.6 ? r() + 0.1 : 0));
    const norm = Math.hypot(...v);
    return v.map((x) => x / norm);
  });
  const shown = scatterView(dense.map(sparse), { method: 'umap' }).points.map((p) => [p.x, p.y]);
  for (let i = 0; i < 30; i++) {
    const near = shown.map((p, j) => [dist(shown[i], p), j]).filter(([, j]) => j !== i).sort((a, b) => a[0] - b[0]).slice(0, 5);
    assert.ok(near.every(([, j]) => (j < 15) === (i < 15)), `row ${i}'s nearest are ${near.map(([, j]) => j)}`);
  }
});

test('an unknown method is refused', () => {
  assert.throws(() => scatterView(fixture(12, 5, 1).map(sparse), { method: 'tsne' }), /tsne/);
});
