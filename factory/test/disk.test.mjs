import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sarkar } from '../viewer/disk.js';

// A fixture phase tree as parent indexes (-1 for the root): a phase of 22 decisions (the real
// log's widest), a chain six deep (its deepest), and a small balanced branch.
const parents = [-1, 0, 0, 0];
for (let i = 0; i < 22; i++) parents.push(1);
parents.push(2, 26, 27, 28, 29); // 26..30, a chain under node 2
parents.push(3, 3, 3); // 31..33
for (const p of [31, 31, 32, 32, 33, 33]) parents.push(p);
const n = parents.length;

const ancestors = (i) => {
  const out = new Set();
  for (let p = parents[i]; p >= 0; p = parents[p]) out.add(p);
  return out;
};

test('the disk layout places every node closer to its parent than to any non-ancestor; only its children tie', () => {
  const disk = sarkar(parents);
  for (let v = 1; v < n; v++) {
    const up = disk.distance(v, parents[v]);
    const above = ancestors(v);
    for (let x = 0; x < n; x++) {
      if (x === v || above.has(x)) continue;
      const d = disk.distance(v, x);
      if (parents[x] === v) assert.ok(Math.abs(d - up) < 1e-9, `child ${x} of ${v}: ${d} vs ${up}`);
      else assert.ok(d > up, `node ${v}: non-ancestor ${x} at ${d}, parent ${parents[v]} at ${up}`);
    }
  }
});

test('every tree edge has the same hyperbolic length, and distance is symmetric and zero only to itself', () => {
  const disk = sarkar(parents);
  for (let v = 1; v < n; v++) assert.ok(Math.abs(disk.distance(v, parents[v]) - disk.tau) < 1e-9, `edge ${v}`);
  for (let a = 0; a < n; a++) {
    assert.equal(disk.distance(a, a), 0);
    for (let b = a + 1; b < n; b++) {
      assert.ok(Math.abs(disk.distance(a, b) - disk.distance(b, a)) < 1e-9, `${a}-${b}`);
      assert.ok(disk.distance(a, b) > 0, `${a}-${b}`);
    }
  }
});

// Poincare distance between two points of the unit disk.
const poincare = ([ax, ay], [bx, by]) => Math.acosh(1 + (2 * ((ax - bx) ** 2 + (ay - by) ** 2)) / ((1 - ax * ax - ay * ay) * (1 - bx * bx - by * by)));

test('drawn from any focus, the focus sits at the centre and the drawing keeps the layout distances', () => {
  const disk = sarkar(parents);
  for (const focus of [0, 1, 30, 36]) {
    const at = disk.from(focus);
    assert.deepEqual(at[focus].map((c) => Math.abs(c) < 1e-12), [true, true]);
    for (const [a, b] of [[focus, parents[focus] < 0 ? 1 : parents[focus]], [4, 5], [30, 29], [34, 35], [31, 3]]) {
      const inside = [...at[a], ...at[b]].every(Number.isFinite) && Math.hypot(...at[a]) <= 1 && Math.hypot(...at[b]) <= 1; // far ones round to the rim
      assert.ok(inside, `focus ${focus}: ${a} at ${at[a]}`);
      // only pairs near the focus have the float precision to compare
      if (Math.max(disk.distance(focus, a), disk.distance(focus, b)) < 12) {
        assert.ok(Math.abs(poincare(at[a], at[b]) - disk.distance(a, b)) < 1e-6, `focus ${focus}: ${a}-${b}`);
      }
    }
  }
});

test('the layout is the same every time for the same tree', () => {
  assert.deepEqual(sarkar(parents).from(0), sarkar(parents).from(0));
});
