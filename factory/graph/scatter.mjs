// The text scatter (spec #52, stories 48 and 50; issue #73): the decision rows' TF-IDF vectors
// (graph/text.mjs) projected to 2-D, scored by how far the picture distorts the full space. Pure,
// like the graph module: no file, network or model, so tests run it on fixture vectors.
//
//   scatterView(vectors, { method = 'pca' }) -> { method, n, points: [{ x, y }], T, C, against, warning }
//     warning   UMAP's small-data warning, null for PCA
//     vectors   sparse vectors, each a Map from term to weight, in the order the points come back
//     T, C      trustworthiness and continuity at k = 5 and 10 (graph/distortion.mjs) of the 2-D
//               distances against the Euclidean distances of the full vectors
//
// PCA is the default, as the projections research recommends below 500 rows
// (research/projections:research/orchestration/projections.md, sections 5 and 6): its axes are the
// directions of greatest variance. It is solved on the n x n centred Gram matrix, since the terms
// far outnumber the rows.
import { euclidean, jacobi, neighbourhoods } from './distortion.mjs';

const dot = (a, b) => {
  if (a.size > b.size) [a, b] = [b, a];
  let s = 0;
  for (const [t, w] of a) s += w * (b.get(t) ?? 0);
  return s;
};

// The n x n dot products.
function gram(vectors) {
  const n = vectors.length;
  const g = Array.from({ length: n }, () => new Float64Array(n));
  for (let i = 0; i < n; i++) for (let j = i; j < n; j++) g[i][j] = g[j][i] = dot(vectors[i], vectors[j]);
  return g;
}

// Euclidean distances between sparse vectors, rounded to 9 decimals. Two rows that share no term
// are sqrt(2) apart, and many rows share none with a given row, so its full-space ranks hold long
// ties; rounded, those tie exactly and go by index (graph/distortion.mjs), not by float noise.
const TIE = 1e9;
function fullDistances(vectors) {
  const n = vectors.length;
  const out = Array.from({ length: n }, () => new Float64Array(n));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = vectors[i], b = vectors[j];
      let s = 0;
      for (const [t, w] of a) s += (w - (b.get(t) ?? 0)) ** 2;
      for (const [t, w] of b) if (!a.has(t)) s += w * w;
      out[i][j] = out[j][i] = Math.round(Math.sqrt(s) * TIE) / TIE;
    }
  }
  return out;
}

// PCA from the Gram matrix: double-centre it, take its top d eigenvectors u_c, and place row i at
// sqrt(lambda_c) u_c(i). Each axis's sign is fixed so its largest entry is positive, so the same
// vectors always give the same picture.
function pca(g, d = 2) {
  const n = g.length;
  const row = g.map((r) => r.reduce((s, x) => s + x, 0) / n);
  const all = row.reduce((s, x) => s + x, 0) / n;
  const c = g.map((r, i) => Float64Array.from(r, (x, j) => x - row[i] - row[j] + all));
  const { values, vectors } = jacobi(c);
  const order = [...values.keys()].sort((a, b) => values[b] - values[a] || a - b).slice(0, d);
  const axes = order.map((k) => {
    const col = vectors.map((v) => v[k]);
    let big = 0;
    col.forEach((x, i) => { if (Math.abs(x) > Math.abs(col[big]) + 1e-12) big = i; });
    const sign = col[big] < 0 ? -1 : 1;
    const scale = Math.sqrt(Math.max(0, values[k]));
    return col.map((x) => sign * scale * x);
  });
  return Array.from({ length: n }, (_, i) => Array.from({ length: d }, (_, a) => axes[a]?.[i] ?? 0));
}

// UMAP (McInnes, Healy and Melville 2018, arXiv:1802.03426v3, sections 3.1-3.2, and umap-learn's
// optimize_layout_euclidean), written out here so the viewer takes no dependency: the fuzzy k-NN
// graph of the full space, w(i, j) = exp(-max(0, d(i, j) - rho_i) / sigma_i) with sigma_i set so
// each row's weights sum to log2 k, symmetrised as A + A^T - A o A^T; then the 2-D layout, started
// from PCA scaled to [-10, 10], pulled along each edge and pushed from negative samples, edges
// sampled in proportion to their weight. a and b are umap-learn's for min_dist 0.1 and spread 1.
// The random draws come from a fixed seed, so the same vectors always give the same picture.
const UMAP = { k: 10, epochs: 200, negatives: 5, a: 1.576943460405378, b: 0.8950608781227859 };

function umap(full, init) {
  const n = full.length;
  const k = Math.min(UMAP.k, n - 1);
  const w = Array.from({ length: n }, () => new Float64Array(n));
  for (let i = 0; i < n; i++) {
    const near = [...full[i].keys()].filter((j) => j !== i).sort((a, b) => full[i][a] - full[i][b] || a - b).slice(0, k);
    const rho = near.map((j) => full[i][j]).find((d) => d > 0) ?? 0;
    const target = Math.log2(k);
    const sum = (sigma) => near.reduce((s, j) => s + Math.exp(-Math.max(0, full[i][j] - rho) / sigma), 0);
    let lo = 0, hi = Infinity, sigma = 1;
    for (let it = 0; it < 64; it++) {
      if (sum(sigma) > target) hi = sigma; else lo = sigma;
      sigma = hi === Infinity ? sigma * 2 : (lo + hi) / 2;
    }
    for (const j of near) w[i][j] = Math.exp(-Math.max(0, full[i][j] - rho) / sigma);
  }
  const edges = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const v = w[i][j] + w[j][i] - w[i][j] * w[j][i];
      if (i !== j && v > 0) edges.push({ i, j, v });
    }
  }
  const top = Math.max(...edges.map((e) => e.v));
  for (const e of edges) {
    e.every = top / e.v;
    e.next = e.every;
    e.everyNeg = e.every / UMAP.negatives;
    e.nextNeg = e.everyNeg;
  }

  const span = Math.max(1e-12, ...init.flat().map(Math.abs));
  const y = init.map((p) => p.map((x) => (10 * x) / span));
  const rand = mulberry32(42);
  const { a, b } = UMAP;
  const clip = (x) => Math.max(-4, Math.min(4, x));
  for (let epoch = 0; epoch < UMAP.epochs; epoch++) {
    const alpha = 1 - epoch / UMAP.epochs;
    for (const e of edges) {
      if (e.next > epoch) continue;
      const p = y[e.i], q = y[e.j];
      const d2 = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2;
      if (d2 > 0) {
        const c = (-2 * a * b * d2 ** (b - 1)) / (a * d2 ** b + 1);
        for (let c2 = 0; c2 < 2; c2++) {
          const g = clip(c * (p[c2] - q[c2])) * alpha;
          p[c2] += g;
          q[c2] -= g;
        }
      }
      e.next += e.every;
      const draws = Math.floor((epoch - e.nextNeg) / e.everyNeg);
      for (let s = 0; s < draws; s++) {
        const m = Math.floor(rand() * n);
        if (m === e.i) continue;
        const r = y[m];
        const r2 = (p[0] - r[0]) ** 2 + (p[1] - r[1]) ** 2;
        const c = r2 > 0 ? (2 * b) / ((0.001 + r2) * (a * r2 ** b + 1)) : 0;
        for (let c2 = 0; c2 < 2; c2++) p[c2] += (c > 0 ? clip(c * (p[c2] - r[c2])) : 4) * alpha;
      }
      e.nextNeg += draws * e.everyNeg;
    }
  }
  return y;
}

function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const METHODS = ['pca', 'umap'];

export function scatterView(vectors, { method = 'pca' } = {}) {
  if (!METHODS.includes(method)) throw new Error(`unknown projection: ${method} (${METHODS.join(' or ')})`);
  const n = vectors.length;
  const g = gram(vectors);
  const full = fullDistances(vectors);
  let xy = pca(g);
  if (method === 'umap' && n > 2) xy = umap(full, xy);
  const { T, C } = neighbourhoods(full, euclidean(xy));
  const warning = method === 'umap'
    ? `UMAP can find structure in noise, and its authors warn that its approximations can hurt below 500 samples (McInnes, Healy and Melville 2018, section 6); this log has ${n} rows. Read clusters here only where T and C hold up, and prefer PCA.`
    : null;
  return { method, n, points: xy.map(([x, y]) => ({ x, y })), T, C, against: { space: 'tf-idf', metric: 'euclidean' }, warning };
}
