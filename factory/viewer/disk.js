// The phase tree in the Poincare disk by Sarkar's construction (spec #52, story 47; issue #72),
// with no DOM, so the page draws it and the server scores it from the same code. The construction
// and its numbers are from research/graph-embeddings:research/orchestration/graph-embeddings.md,
// sections 1 and 4b (after De Sa, Gu, Re and Sala 2018, section 3.1): each node's children go
// evenly round a hyperbolic circle of radius tau about it, its parent taking one of the places, so
// every tree edge is exactly tau long.
//
//   sarkar(parents, { tau? }) -> disk
//     parents      the parent index of each node, -1 for the one root
//     disk.tau     the edge length; by default the shortest that keeps the tree (see fitTau)
//     disk.distance(i, j)   hyperbolic distance between two nodes
//     disk.from(focus)      [x, y] of every node in the unit disk, `focus` at the centre
//   geodesic(p, q, steps)   points along the hyperbolic line from p to q, for drawing
//
// Far from the root a node sits within 1e-10 of the rim, past what float64 can tell apart, so a
// node's place is kept as the isometry from its parent's frame (a step) and every answer is
// composed along the tree path between the two nodes it concerns: what is near is exact.

// An isometry of the disk, z -> (a z + b) / (conj(b) z + conj(a)) with |a|^2 - |b|^2 = 1, as
// [a.re, a.im, b.re, b.im].
const compose = ([a, b, c, d], [e, f, g, h]) => [
  a * e - b * f + (c * g + d * h), a * f + b * e + (d * g - c * h),
  a * g - b * h + (c * e + d * f), a * h + b * g + (d * e - c * f),
];
const inverse = ([a, b, c, d]) => [a, -b, -c, -d];
const rotate = (theta) => [Math.cos(theta / 2), Math.sin(theta / 2), 0, 0];
const translate = (t) => [Math.cosh(t / 2), 0, Math.sinh(t / 2), 0];
// The image of 0: b / conj(a).
const origin = ([a, b, c, d]) => {
  const m = a * a + b * b;
  return [(c * a - d * b) / m, (d * a + c * b) / m];
};
// How far it moves 0: cosh d = |a|^2 + |b|^2 = 1 + 2|b|^2, so d = 2 asinh |b| (exact near and far).
const moves = ([, , c, d]) => 2 * Math.asinh(Math.hypot(c, d));

// The edge length. Sarkar's tau must keep two neighbours of a node, 2 pi / slots apart round it,
// farther from each other than from it, which needs cosh(tau/2) > 1 / (2 sin(pi / slots)). From
// just past that bound, tau grows until every node is nearer its parent than any node outside its
// own line (its children tie): the shortest edge that keeps the tree, so the most of it in view.
function fitTau(parents) {
  const kids = parents.map(() => 0);
  for (const p of parents) if (p >= 0) kids[p]++;
  const slots = Math.max(2, ...kids.map((k, i) => k + (parents[i] >= 0 ? 1 : 0)));
  let t = Math.max(1, 1.02 * 2 * Math.acosh(Math.max(1, 1 / (2 * Math.sin(Math.PI / slots)))));
  for (let tries = 0; tries < 40 && !keeps(parents, sarkar(parents, { tau: t })); tries++) t *= 1.1;
  return t;
}

function keeps(parents, disk) {
  const n = parents.length;
  for (let v = 0; v < n; v++) {
    if (parents[v] < 0) continue;
    const up = disk.distance(v, parents[v]);
    const line = new Set([v]);
    for (let p = parents[v]; p >= 0; p = parents[p]) line.add(p);
    for (let x = 0; x < n; x++) if (!line.has(x) && parents[x] !== v && disk.distance(v, x) <= up) return false;
  }
  return true;
}

export function sarkar(parents, { tau } = {}) {
  if (tau === undefined) return sarkar(parents, { tau: fitTau(parents) });
  const t = tau;
  const n = parents.length;
  const children = parents.map(() => []);
  parents.forEach((p, i) => { if (p >= 0) children[p].push(i); });
  const depth = new Int32Array(n);
  const order = [];
  for (const r of parents.flatMap((p, i) => (p < 0 ? [i] : []))) {
    const queue = [r];
    while (queue.length) {
      const v = queue.shift();
      order.push(v);
      for (const c of children[v]) { depth[c] = depth[v] + 1; queue.push(c); }
    }
  }
  // A step: from the parent's frame (the parent at 0, its own parent towards angle pi) to the
  // child's, which the step leaves with the parent towards angle pi in turn.
  const step = new Array(n).fill(null);
  for (const v of order) {
    const cs = children[v];
    const k = cs.length + (parents[v] >= 0 ? 1 : 0);
    cs.forEach((c, j) => {
      const theta = parents[v] >= 0 ? Math.PI + (2 * Math.PI * (j + 1)) / k : (2 * Math.PI * j) / k;
      step[c] = compose(rotate(theta), translate(t));
    });
  }
  const I = [1, 0, 0, 0];
  // from the frame of the nearest common ancestor down to i
  const down = (i, stop) => {
    let m = I;
    for (let v = i; v !== stop; v = parents[v]) m = compose(step[v], m);
    return m;
  };
  const meet = (i, j) => {
    while (depth[i] > depth[j]) i = parents[i];
    while (depth[j] > depth[i]) j = parents[j];
    while (i !== j) { i = parents[i]; j = parents[j]; }
    return i;
  };
  return {
    tau: t,
    distance(i, j) {
      if (i === j) return 0;
      const w = meet(i, j);
      return moves(compose(inverse(down(i, w)), down(j, w)));
    },
    from(focus) {
      const frame = new Array(n).fill(null);
      frame[focus] = I;
      const queue = [focus];
      while (queue.length) {
        const v = queue.shift();
        const p = parents[v];
        if (p >= 0 && !frame[p]) { frame[p] = compose(frame[v], inverse(step[v])); queue.push(p); }
        for (const c of children[v]) if (!frame[c]) { frame[c] = compose(frame[v], step[c]); queue.push(c); }
      }
      // a far node can round past the rim; it is drawn on it
      return frame.map((m) => {
        if (!m) return [NaN, NaN];
        const [x, y] = origin(m), r = Math.hypot(x, y);
        return r > 1 ? [x / r, y / r] : [x, y];
      });
    },
  };
}

// The hyperbolic line from p to q in the disk: move p to 0, where the line is straight, sample it,
// and move back.
export function geodesic([px, py], [qx, qy], steps = 12) {
  const mul = ([a, b], [c, d]) => [a * c - b * d, a * d + b * c];
  const div = ([a, b], [c, d]) => { const m = c * c + d * d; return [(a * c + b * d) / m, (b * c - a * d) / m]; };
  const p = [px, py], pc = [px, -py];
  const away = (z) => div([z[0] - px, z[1] - py], [1 - mul(pc, z)[0], -mul(pc, z)[1]]);
  const back = (z) => div([z[0] + px, z[1] + py], [1 + mul(pc, z)[0], mul(pc, z)[1]]);
  const end = away([qx, qy]);
  return Array.from({ length: steps + 1 }, (_, s) => (s === 0 ? p : s === steps ? [qx, qy] : back([end[0] * (s / steps), end[1] * (s / steps)])));
}
