// How far a picture distorts the full space (spec #52, story 49; issue #72). Pure, like the graph
// module: no file, network or model, so tests run it on fixture vectors.
//
//   euclidean(points)                      -> n x n distance matrix
//   neighbourhoods(full, view, ks?)        -> { T: { k: score }, C: { k: score } }
//   eigenmap(n, links, d?)                 -> n points in R^d (Laplacian eigenmaps)
//
// Trustworthiness T(k) and continuity C(k) are Venna and Kaski's M1 and M2 (WSOM 2005, section 2.1,
// eqs. 1-2), read from research/projections:research/orchestration/projections.md. Low T means the
// view shows false neighbours; low C means it hides true ones. Both are 1 for a perfect view and
// near 0.5 for a random one. They are normalised for k < n/2 only, so a larger k scores null.
//
// Laplacian eigenmaps (Belkin and Niyogi 2003, section 2) are the structural yardstick a view of the
// graph is scored against (research/graph-embeddings:research/orchestration/graph-embeddings.md, which
// takes d about 16): with W the 0/1 adjacency, D its degrees and L = D - W, solve L f = lambda D f,
// drop the constant f0 and place node i at (f1(i), ..., fd(i)).

export function euclidean(points) {
  const n = points.length;
  const out = Array.from({ length: n }, () => new Float64Array(n));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      let s = 0;
      for (let c = 0; c < points[i].length; c++) s += (points[i][c] - points[j][c]) ** 2;
      out[i][j] = out[j][i] = Math.sqrt(s);
    }
  }
  return out;
}

// `full` and `view` are n x n distance matrices over the same points, in the same order.
export function neighbourhoods(full, view, ks = [5, 10]) {
  const n = full.length;
  const rf = ranks(full), rv = ranks(view);
  const T = {}, C = {};
  for (const k of ks) {
    if (k >= n / 2) {
      T[k] = C[k] = null;
      continue;
    }
    T[k] = score(rf, rv, k); // false neighbours in the view, by their rank in the full space
    C[k] = score(rv, rf, k); // true neighbours the view loses, by their rank in the view
  }
  return { T, C };
}

// 1 - 2/(n k (2n - 3k - 1)) * sum over i, over j in i's k-NN by `near` but not by `far`, of
// (far rank of j from i) - k.
function score(far, near, k) {
  const n = far.length;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) if (j !== i && near[i][j] <= k && far[i][j] > k) sum += far[i][j] - k;
  }
  return 1 - (2 / (n * k * (2 * n - 3 * k - 1))) * sum;
}

// ranks[i][j]: j's place (1 = nearest) among the others by distance from i; ties go by index.
function ranks(dist) {
  const n = dist.length;
  return dist.map((row, i) => {
    const order = [...Array(n).keys()].filter((j) => j !== i).sort((a, b) => row[a] - row[b] || a - b);
    const r = new Int32Array(n);
    order.forEach((j, p) => { r[j] = p + 1; });
    return r;
  });
}

// `links` are [a, b] index pairs; repeats and self-links count once and never. The graph must be
// connected. d is capped at n - 1, the number of non-trivial eigenvectors.
export function eigenmap(n, links, d = 16) {
  const w = Array.from({ length: n }, () => new Float64Array(n));
  for (const [a, b] of links) if (a !== b) w[a][b] = w[b][a] = 1;
  const deg = w.map((row) => row.reduce((s, x) => s + x, 0));
  // L f = lambda D f is the symmetric problem D^-1/2 L D^-1/2 g = lambda g, with f = D^-1/2 g.
  const s = deg.map((x) => 1 / Math.sqrt(x || 1));
  const m = w.map((row, i) => Float64Array.from(row, (x, j) => (i === j ? (deg[i] ? 1 : 0) : -x * s[i] * s[j])));
  const { values, vectors } = jacobi(m);
  const order = [...values.keys()].sort((a, b) => values[a] - values[b] || a - b).slice(1, 1 + Math.min(d, n - 1));
  return Array.from({ length: n }, (_, i) => order.map((c) => vectors[i][c] * s[i]));
}

// Cyclic Jacobi for a symmetric matrix: eigenvalues and eigenvectors (as columns). Exact enough for
// the few hundred nodes the factory has (about 70 ms at n = 150, per the graph-embeddings research).
function jacobi(a) {
  const n = a.length;
  const v = Array.from({ length: n }, (_, i) => Float64Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += a[p][q] ** 2;
    if (off < 1e-22) break;
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(a[p][q]) < 1e-300) continue;
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1), sn = t * c;
        for (let k = 0; k < n; k++) {
          const akp = a[k][p], akq = a[k][q];
          a[k][p] = c * akp - sn * akq;
          a[k][q] = sn * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p][k], aqk = a[q][k];
          a[p][k] = c * apk - sn * aqk;
          a[q][k] = sn * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = v[k][p], vkq = v[k][q];
          v[k][p] = c * vkp - sn * vkq;
          v[k][q] = sn * vkp + c * vkq;
        }
      }
    }
  }
  return { values: a.map((row, i) => row[i]), vectors: v };
}
