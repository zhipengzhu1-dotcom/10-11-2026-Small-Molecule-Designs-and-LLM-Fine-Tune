// A 2-D node-link drawing on a canvas, shared by the phase disk (graph.js) and the agent network
// (crew.js): grey dots, thin links, hover lights a node and its neighbours, click opens its card,
// each link kind is a layer that can be hidden, and a node with `live` set pulses inside a halo.
// Where the nodes sit and what dragging does belong to the `space`: a force layout to pan and zoom
// (forceSpace, below), or the Poincare disk (graph.js).
//
// `look` says what is drawn and how:
//   build(data)                  -> { nodes, links } (see layout.js)
//   kinds                        link kinds, in drawing order
//   shown                        { kind: true|false } at start
//   lines[kind]                  { dash: [on, off] } (pixels), { alpha }, `arrow: true` for a head at the target
//   lineColor(kind, colors)      the layer's colour when nothing is lit
//   radius(n), shape(n)          size in pixels; 'dot' (filled) or 'ring' (outline)
//   color(n, colors)             the node's colour when nothing is lit
//   visible(n, shown)            optional; default every node
//   label(n)                     the text under a node
//   labelled(n, i, { set, focus, scale })  whether its label shows; `set` is the lit nodes or null
//   tip(n)                       hover content, or null
//   card(i, view)                the card's content; view = { graph, neighbours, cross(kind) }
//   picked(i)                    optional: told of each click, with the node or null for empty space
//
// A `space`:
//   start(graph, prev)           a new graph; `prev` is the last one, to keep places, or null
//   tick()                       one step of any motion
//   place(w, h)                  -> each node's [x, y] in pixels, or null where it is not drawn
//   path(l, at)                  -> the pixels a link runs through, or null
//   scale(i, at)                 optional: how much smaller node i is drawn where it sits (1 = full)
//   labelAt(i, at, r)            optional: [x, y, textAlign, textBaseline] of node i's label; default under it
//   backdrop(ctx, w, h, colors)  optional: drawn under everything
//   click(i), drag(press, p), release(press), wheel(e, p), reset(w, h)   optional: the pointer
import { h } from './ui.js';
import { createSimulation } from './layout.js';

export const tokens = () => {
  const css = getComputedStyle(document.documentElement);
  const c = (name) => css.getPropertyValue(name).trim();
  return { bg: c('--panel'), node: c('--g-node'), leaf: c('--g-leaf'), link: c('--g-link'), hi: c('--g-hi'), dim: c('--g-dim'), muted: c('--muted'), fg: c('--fg'), line: c('--line') };
};

export function createPlane({ stage, tip, card }, look, space) {
  const canvas = h('canvas');
  stage.prepend(canvas);
  const ctx = canvas.getContext('2d');
  let colors = tokens();
  let graph = null, key = '', neighbours = [], at = [];
  let hover = null, active = null; // hovered node index; node whose card is open
  let w = 1, hgt = 1;
  const shown = { ...look.shown };
  const visible = (n) => look.visible?.(n, shown) ?? true;

  function resize() {
    w = Math.max(1, stage.clientWidth);
    hgt = Math.max(1, stage.clientHeight);
    canvas.width = Math.round(w * devicePixelRatio);
    canvas.height = Math.round(hgt * devicePixelRatio);
    canvas.style.width = w + 'px';
    canvas.style.height = hgt + 'px';
  }
  new ResizeObserver(resize).observe(stage);
  resize();

  function build(data) {
    const prev = graph;
    graph = look.build(data);
    space.start(graph, prev);
    neighbours = graph.nodes.map(() => new Set());
    for (const l of graph.links) { neighbours[l.source].add(l.target); neighbours[l.target].add(l.source); }
    hover = null; active = null; card.hidden = true;
    if (!prev) space.reset?.(w, hgt);
  }

  const linkShown = (a, b) => graph.links.some((l) => shown[l.kind] && ((l.source === a && l.target === b) || (l.source === b && l.target === a)));
  function lit() {
    const focus = hover ?? active;
    if (focus == null) return null;
    return new Set([focus, ...[...neighbours[focus]].filter((j) => visible(graph.nodes[j]) && linkShown(focus, j))]);
  }
  const size = (i) => look.radius(graph.nodes[i]) * (space.scale?.(i, at) ?? 1);
  const drawn = (i) => at[i] && visible(graph.nodes[i]);

  function stroke(points, color, kind) {
    const o = look.lines[kind] ?? {};
    ctx.strokeStyle = color;
    ctx.globalAlpha = o.alpha ?? 1;
    ctx.setLineDash(o.dash ?? []);
    ctx.beginPath();
    points.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.setLineDash([]);
  }
  // the arrowhead sits just short of the target, along the link's last stretch
  function arrow(points, target, color) {
    const [x, y] = points.at(-1), [px, py] = points.at(-2);
    const d = Math.hypot(x - px, y - py) || 1, ux = (x - px) / d, uy = (y - py) / d;
    const r = size(target) + 2, len = 7, half = 3;
    const tx = x - ux * r, ty = y - uy * r;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(tx - ux * len - uy * half, ty - uy * len + ux * half);
    ctx.lineTo(tx - ux * len + uy * half, ty - uy * len - ux * half);
    ctx.fill();
  }

  function draw(now) {
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    ctx.clearRect(0, 0, w, hgt);
    space.backdrop?.(ctx, w, hgt, colors);
    if (!graph) return;
    at = space.place(w, hgt);
    const on = lit();
    const focus = hover ?? active;
    ctx.lineWidth = 1;
    const paths = new Map();
    const pathOf = (l) => {
      if (!paths.has(l)) paths.set(l, drawn(l.source) && drawn(l.target) ? space.path(l, at) : null);
      return paths.get(l);
    };
    for (const kind of look.kinds) {
      if (!shown[kind]) continue;
      const color = on ? colors.dim : look.lineColor(kind, colors);
      for (const l of graph.links) {
        if (l.kind !== kind) continue;
        const p = pathOf(l);
        if (!p) continue;
        stroke(p, color, kind);
        if (look.lines[kind]?.arrow) arrow(p, l.target, color);
      }
    }
    if (focus != null) {
      ctx.lineWidth = 1.5;
      for (const l of graph.links) {
        if (!shown[l.kind] || (l.source !== focus && l.target !== focus)) continue;
        const p = pathOf(l);
        if (!p) continue;
        stroke(p, colors.hi, l.kind);
        if (look.lines[l.kind]?.arrow) arrow(p, l.target, colors.hi);
      }
      ctx.lineWidth = 1;
    }
    const beat = 1.9 + 0.5 * Math.sin(now / 300);
    graph.nodes.forEach((n, i) => {
      if (!drawn(i)) return;
      const [x, y] = at[i], r = size(i);
      const color = on ? (on.has(i) ? colors.hi : colors.dim) : look.color(n, colors);
      if (n.live) {
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = on && !on.has(i) ? colors.dim : colors.hi;
        ctx.beginPath();
        ctx.arc(x, y, r * beat, 0, 2 * Math.PI);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.beginPath();
      ctx.arc(x, y, Math.max(r, 0.6), 0, 2 * Math.PI);
      if (look.shape(n) === 'ring') {
        ctx.fillStyle = colors.bg;
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.stroke();
      } else {
        ctx.fillStyle = color;
        ctx.fill();
      }
    });
    // labels, as `look.labelled` says
    ctx.font = '11px system-ui, -apple-system, "Segoe UI", sans-serif';
    graph.nodes.forEach((n, i) => {
      if (!drawn(i)) return;
      const scale = space.scale?.(i, at) ?? 1;
      if (!look.labelled(n, i, { set: on, focus, scale })) return;
      ctx.fillStyle = on?.has(i) ? colors.fg : colors.muted;
      const [x, y, align = 'center', base = 'top'] = space.labelAt?.(i, at, size(i)) ?? [at[i][0], at[i][1] + size(i) + 3];
      ctx.textAlign = align;
      ctx.textBaseline = base;
      ctx.fillText(look.label(n), x, y);
    });
  }

  function frame(now) {
    if (graph) space.tick();
    draw(now);
    requestAnimationFrame(frame);
  }

  const local = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  // the nearest drawn node under the pointer, with a little slack round small ones
  function pick([sx, sy]) {
    if (!graph) return null;
    let best = null, bd = Infinity;
    graph.nodes.forEach((n, i) => {
      if (!drawn(i)) return;
      const d = Math.hypot(at[i][0] - sx, at[i][1] - sy);
      if (d <= Math.max(size(i), 3) + 3 && d < bd) { bd = d; best = i; }
    });
    return best;
  }

  function showCard(i) {
    active = i;
    const cross = (kind) => graph.links.filter((l) => l.kind === kind && (l.source === i || l.target === i));
    card.replaceChildren(closeButton(), ...look.card(i, { graph, neighbours, cross }));
    card.hidden = false;
  }
  function closeButton() {
    const b = h('button', { class: 'x', title: 'close' }, '×');
    b.addEventListener('click', () => { card.hidden = true; active = null; });
    return b;
  }

  let press = null;
  canvas.addEventListener('pointerdown', (e) => {
    const p = local(e);
    press = { i: pick(p), p, moved: false };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = local(e);
    if (press) {
      if (Math.hypot(p[0] - press.p[0], p[1] - press.p[1]) > 3 && !press.moved) { press.moved = true; stage.classList.add('dragging'); tip.hidden = true; }
      if (press.moved) space.drag?.(press, p);
      return;
    }
    const i = pick(p);
    hover = i;
    canvas.style.cursor = i != null ? 'pointer' : '';
    const content = i == null ? null : look.tip(graph.nodes[i]);
    tip.hidden = !content;
    if (content) {
      tip.replaceChildren(...content);
      tip.style.left = Math.min(p[0] + 14, w - tip.offsetWidth - 4) + 'px';
      tip.style.top = p[1] + 14 + 'px';
    }
  });
  canvas.addEventListener('pointerleave', () => { if (!press) { hover = null; tip.hidden = true; } });
  canvas.addEventListener('pointerup', () => {
    if (press?.moved) space.release?.(press);
    else if (press?.i != null) { space.click?.(press.i); showCard(press.i); hover = null; tip.hidden = true; look.picked?.(press.i); }
    else if (press) { card.hidden = true; active = null; look.picked?.(null); }
    press = null;
    stage.classList.remove('dragging');
  });
  canvas.addEventListener('dblclick', () => space.reset?.(w, hgt));
  canvas.addEventListener('wheel', (e) => space.wheel?.(e, local(e)), { passive: false });
  requestAnimationFrame(frame);

  return {
    recolor() { colors = tokens(); },
    setLayer(kind, on) { shown[kind] = on; },
    fit() { space.reset?.(w, hgt); },
    update(data) {
      const next = JSON.stringify(data);
      if (next === key) return;
      key = next;
      build(data);
    },
    // start afresh on the next update, for a new set of nodes (another run, all runs)
    refit() { key = ''; graph = null; },
    graph: () => graph,
    // light node i, as if its card were open but with the card closed, and bring it into view; null
    // clears it (a pick in a linked view, see linkViews in layout.js)
    highlight(i) {
      card.hidden = true;
      active = i;
      if (i != null) space.click?.(i);
    },
  };
}

// The force layout (layout.js) in the plane, to pan and zoom: drag empty space to pan, scroll to
// zoom round the pointer, drag a node to move it (it rejoins the layout when let go), double-click
// to fit.
export function forceSpace() {
  let graph = null, sim = null;
  const view = { k: 1, x: 0, y: 0 }; // pixels per unit, and the point at the stage's centre
  let w = 1, hgt = 1;
  const world = ([sx, sy]) => [view.x + (sx - w / 2) / view.k, view.y + (sy - hgt / 2) / view.k];
  return {
    start(g, prev) {
      const old = new Map((prev?.nodes ?? []).map((n) => [n.id, n]));
      for (const n of g.nodes) { const p = old.get(n.id); if (p) Object.assign(n, { x: p.x, y: p.y }); }
      graph = g;
      sim = createSimulation(g.nodes, g.links);
      if (!prev) for (let i = 0; i < 300; i++) sim.tick(); // open on a settled layout
    },
    tick() { if (sim && !sim.settled()) sim.tick(); },
    place(width, height) {
      w = width; hgt = height;
      return graph.nodes.map((n) => [w / 2 + (n.x - view.x) * view.k, hgt / 2 + (n.y - view.y) * view.k]);
    },
    path: (l, at) => [at[l.source], at[l.target]],
    scale: () => Math.min(1.6, Math.max(0.5, Math.sqrt(view.k))),
    drag(press, p) {
      if (press.i != null) {
        const [x, y] = world(p);
        Object.assign(graph.nodes[press.i], { fx: x, fy: y });
        sim.reheat(0.3);
        return;
      }
      press.from ??= { ...view };
      view.x = press.from.x - (p[0] - press.p[0]) / view.k;
      view.y = press.from.y - (p[1] - press.p[1]) / view.k;
    },
    release(press) {
      if (press.i != null) Object.assign(graph.nodes[press.i], { fx: null, fy: null });
    },
    wheel(e, p) {
      e.preventDefault();
      const [x, y] = world(p);
      view.k = Math.min(8, Math.max(0.05, view.k * Math.exp(-e.deltaY * 0.0015)));
      view.x = x - (p[0] - w / 2) / view.k;
      view.y = y - (p[1] - hgt / 2) / view.k;
    },
    // frame most of the graph: a few outliers should not shrink everything else
    reset(width, height) {
      if (!graph?.nodes.length) return;
      w = width; hgt = height;
      const n = graph.nodes.length;
      view.x = graph.nodes.reduce((s, m) => s + m.x, 0) / n;
      view.y = graph.nodes.reduce((s, m) => s + m.y, 0) / n;
      const ds = graph.nodes.map((m) => Math.hypot(m.x - view.x, m.y - view.y)).sort((a, b) => a - b);
      const r = Math.max(40, ds[Math.floor(n * 0.92)] ?? 0);
      view.k = (Math.min(w, hgt) / 2 - 30) / r;
    },
  };
}
