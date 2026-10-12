// Text scatter: the decision rows' TF-IDF vectors projected to 2-D by the server (PCA, or UMAP when
// asked; see graph/scatter.mjs), drawn in the plane (see plane.js) and linked to the phase disk:
// clicking a row here lights it there, and the other way round (see linkViews in layout.js). Each
// row is drawn by its label as on the disk: in a solid dot, undec a grey one, out an outline.
// Nearness here is only as good as the T(k) and C(k) printed above the panel.
import { buildScatter } from './layout.js';
import { createPlane } from './plane.js';
import { clock, h } from './ui.js';

const trim = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

// The points fill the stage, the same scale on both axes so distances keep their ratios; scroll
// to zoom round the pointer, drag to pan, double-click to fit again.
function pointSpace() {
  let graph = null;
  let w = 1, hgt = 1;
  const view = { k: 1, x: 0, y: 0 }; // pixels per unit, and the point at the stage's centre
  const world = ([sx, sy]) => [view.x + (sx - w / 2) / view.k, view.y - (sy - hgt / 2) / view.k];
  return {
    start(g) { graph = g; }, // the plane fits a first graph (reset); later ones keep the view
    tick() {},
    place(width, height) {
      w = width; hgt = height;
      return graph.nodes.map((n) => [w / 2 + (n.x - view.x) * view.k, hgt / 2 - (n.y - view.y) * view.k]);
    },
    path: (l, at) => [at[l.source], at[l.target]],
    drag(press, p) {
      press.from ??= { ...view };
      view.x = press.from.x - (p[0] - press.p[0]) / view.k;
      view.y = press.from.y + (p[1] - press.p[1]) / view.k;
    },
    wheel(e, p) {
      e.preventDefault();
      const [x, y] = world(p);
      view.k = Math.min(1e6, Math.max(1e-6, view.k * Math.exp(-e.deltaY * 0.0015)));
      view.x = x - (p[0] - w / 2) / view.k;
      view.y = y + (p[1] - hgt / 2) / view.k;
    },
    reset(width, height) {
      w = width; hgt = height;
      if (!graph?.nodes.length) return;
      const xs = graph.nodes.map((n) => n.x), ys = graph.nodes.map((n) => n.y);
      const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      view.x = (x0 + x1) / 2;
      view.y = (y0 + y1) / 2;
      view.k = Math.min((w - 60) / Math.max(x1 - x0, 1e-9), (hgt - 40) / Math.max(y1 - y0, 1e-9));
    },
  };
}

// `picked(i)` hears each click, for the disk it is linked to.
export function createScatter(parts, { picked } = {}) {
  return createPlane(parts, {
    picked,
    build: ({ scatter, tree }) => buildScatter(scatter, tree),
    kinds: [],
    shown: {},
    lines: {},
    lineColor: (kind, c) => c.link,
    radius: () => 4,
    shape: (n) => (n.decision.label === 'out' ? 'ring' : 'dot'),
    color: (n, c) => (n.decision.label === 'in' ? c.node : c.leaf),
    label: (n) => trim(n.label, 48),
    labelled: (n, i, { set }) => Boolean(set?.has(i)),
    tip: (n) => [h('b', null, n.decision.phase ?? ''), ' · line ' + n.decision.line + ' · ' + n.decision.label, h('br'), n.label],
    card: (i, { graph }) => {
      const d = graph.nodes[i].decision;
      return [h('code', null, (d.phase ?? '') + ' · line ' + d.line + (d.ts ? ' · ' + clock(d.ts) : '') + ' · ' + d.label),
        h('div', { class: 'k' }, 'decision'), h('div', null, d.decision ?? ''),
        h('div', { class: 'k' }, 'why'), h('div', null, d.why ?? ''),
        h('div', { class: 'k' }, 'result'), h('div', null, d.result ?? '')];
    },
  }, pointSpace());
}
