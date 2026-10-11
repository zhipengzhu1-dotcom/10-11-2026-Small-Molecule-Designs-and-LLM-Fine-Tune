// Decision graph in three.js, after Obsidian's graph view: grey nodes on a plain ground, thin
// links, a force layout that keeps moving while it settles. Hover lights a node and its
// neighbours and dims the rest; click a node for its card; drag a node to move it.
import * as THREE from 'three';
import { buildGraph, createSimulation } from './layout.js';
import { clock, h } from './ui.js';

const tokens = () => {
  const css = getComputedStyle(document.documentElement);
  const c = (name) => new THREE.Color(css.getPropertyValue(name).trim());
  return { node: c('--g-node'), leaf: c('--g-leaf'), link: c('--g-link'), hi: c('--g-hi'), dim: c('--g-dim') };
};

const radius = (n) => (n.kind === 'root' ? 9 : n.kind === 'phase' ? Math.min(14, 3 + 1.8 * Math.sqrt(n.count)) : 2.6);

export function createGraph({ stage, labels, tip, card }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(devicePixelRatio);
  stage.prepend(renderer.domElement);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 10);
  const scene = new THREE.Scene();
  const circle = new THREE.CircleGeometry(1, 32);
  const ring = new THREE.RingGeometry(1.35, 1.6, 48);

  let colors = tokens();
  let graph = null, sim = null, key = '';
  let meshes = [], spans = [], neighbours = [];
  let hover = null, active = null; // hovered node index; node whose card is open
  let w = 1, hgt = 1, dirty = true, fitted = false, fitZoom = 1;

  const links = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial());
  const hiLinks = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial());
  const halo = new THREE.Mesh(ring, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.5 }));
  halo.visible = false;
  scene.add(links, hiLinks, halo);


  function resize() {
    w = Math.max(1, stage.clientWidth);
    hgt = Math.max(1, stage.clientHeight);
    renderer.setSize(w, hgt);
    Object.assign(camera, { left: -w / 2, right: w / 2, top: hgt / 2, bottom: -hgt / 2 });
    camera.updateProjectionMatrix();
    dirty = true;
  }
  new ResizeObserver(resize).observe(stage);
  resize();

  function fit() {
    if (!graph) return;
    const xs = graph.nodes.map((n) => n.x), ys = graph.nodes.map((n) => n.y);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    camera.position.set((x0 + x1) / 2, (y0 + y1) / 2, 5);
    camera.zoom = fitZoom = Math.min(3, 0.9 * Math.min(w / (x1 - x0 + 40), hgt / (y1 - y0 + 40)));
    camera.updateProjectionMatrix();
    dirty = true;
  }

  function build(tree) {
    const prev = new Map((graph?.nodes ?? []).map((n) => [n.id, n]));
    for (const m of meshes) { scene.remove(m); m.material.dispose(); }
    graph = buildGraph(tree);
    for (const n of graph.nodes) { const p = prev.get(n.id); if (p) { n.x = p.x; n.y = p.y; } }
    sim = createSimulation(graph.nodes, graph.links);
    if (!prev.size) for (let i = 0; i < 300; i++) sim.tick(); // open on a settled layout
    neighbours = graph.nodes.map(() => new Set());
    for (const l of graph.links) { neighbours[l.source].add(l.target); neighbours[l.target].add(l.source); }
    meshes = graph.nodes.map((n) => {
      const m = new THREE.Mesh(circle, new THREE.MeshBasicMaterial());
      m.scale.setScalar(radius(n));
      m.position.z = 1;
      scene.add(m);
      return m;
    });
    links.geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(graph.links.length * 6), 3));
    spans = graph.nodes.map((n) => labels.appendChild(h('span', { style: 'opacity:0' }, n.kind === 'decision' ? trim(n.label, 48) : n.label)));
    labels.replaceChildren(...spans);
    hover = null; active = null; card.hidden = true;
    paint();
    if (!fitted) { fit(); fitted = true; }
  }

  const trim = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

  // Colours depend on what is hovered: the node and its neighbours light up, the rest dim.
  function lit() {
    const focus = hover ?? active;
    return focus == null ? null : new Set([focus, ...neighbours[focus]]);
  }
  function paint() {
    if (!graph) return;
    const on = lit();
    graph.nodes.forEach((n, i) => {
      const base = n.kind === 'decision' ? colors.leaf : colors.node;
      meshes[i].material.color = on ? (on.has(i) ? colors.hi : colors.dim) : base;
    });
    links.material.color = on ? colors.dim : colors.link;
    hiLinks.material.color = colors.hi;
    halo.material.color = colors.hi;
    dirty = true;
  }

  function place() {
    const pos = links.geometry.attributes.position;
    graph.links.forEach((l, k) => {
      const s = graph.nodes[l.source], t = graph.nodes[l.target];
      pos.setXYZ(2 * k, s.x, s.y, 0);
      pos.setXYZ(2 * k + 1, t.x, t.y, 0);
    });
    pos.needsUpdate = true;
    links.geometry.computeBoundingSphere();
    graph.nodes.forEach((n, i) => meshes[i].position.set(n.x, n.y, 1));
    const focus = hover ?? active;
    const on = focus == null ? [] : graph.links.filter((l) => l.source === focus || l.target === focus);
    hiLinks.geometry.setAttribute('position', new THREE.Float32BufferAttribute(on.flatMap((l) => {
      const s = graph.nodes[l.source], t = graph.nodes[l.target];
      return [s.x, s.y, 0.5, t.x, t.y, 0.5];
    }), 3));
    halo.visible = focus != null;
    if (focus != null) { const n = graph.nodes[focus]; halo.position.set(n.x, n.y, 0.8); halo.scale.setScalar(radius(n)); }
    // HTML labels: big phases always, every phase once zoomed in past the fitted view, anything lit
    const z = camera.zoom, set = lit();
    graph.nodes.forEach((n, i) => {
      const [sx, sy] = screen(n);
      const show = set ? set.has(i) && (n.kind !== 'decision' || i === focus) : n.kind !== 'decision' && (n.kind === 'root' || n.count >= 6 || z >= fitZoom * 1.6);
      const el = spans[i];
      el.style.opacity = show ? 1 : 0;
      el.className = set?.has(i) ? 'hi' : '';
      el.style.left = sx + 'px';
      el.style.top = sy + radius(n) * z + 3 + 'px';
    });
  }

  const screen = (n) => [(n.x - camera.position.x) * camera.zoom + w / 2, hgt / 2 - (n.y - camera.position.y) * camera.zoom];
  const world = (sx, sy) => [(sx - w / 2) / camera.zoom + camera.position.x, (hgt / 2 - sy) / camera.zoom + camera.position.y];

  function frame() {
    if (sim && !sim.settled()) { sim.tick(); dirty = true; }
    if (graph && dirty) {
      place();
      renderer.render(scene, camera);
      dirty = false;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  function nodeAt(sx, sy) {
    if (!graph) return null;
    let best = null, bd = Infinity;
    graph.nodes.forEach((n, i) => {
      const [x, y] = screen(n);
      const d = Math.hypot(x - sx, y - sy);
      if (d < Math.max(6, radius(n) * camera.zoom + 3) && d < bd) { bd = d; best = i; }
    });
    return best;
  }

  function showCard(i) {
    active = i;
    const n = graph.nodes[i];
    if (n.kind === 'decision') {
      const d = n.decision;
      card.replaceChildren(closeButton(), h('code', null, d.phase + ' · ' + clock(d.ts)),
        h('div', { class: 'k' }, 'decision'), h('div', null, d.decision),
        h('div', { class: 'k' }, 'why'), h('div', null, d.why),
        h('div', { class: 'k' }, 'result'), h('div', null, d.result),
        h('div', { class: 'k' }, 'evidence'), h('div', { class: 'mono' }, d.evidence));
    } else {
      const kids = [...neighbours[i]].map((j) => graph.nodes[j]).filter((m) => m.kind === 'decision');
      card.replaceChildren(closeButton(), h('b', null, n.id || 'all decisions'), ' ', h('span', { class: 'muted' }, n.count + ' decisions'),
        ...kids.map((m) => h('div', { class: 'dec' }, h('code', null, clock(m.decision.ts)), ' ', m.decision.decision)));
    }
    card.hidden = false;
    paint();
  }
  function closeButton() {
    const b = h('button', { class: 'x', title: 'close' }, '×');
    b.addEventListener('click', () => { card.hidden = true; active = null; paint(); });
    return b;
  }

  let drag = null;
  const local = (e) => { const r = stage.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  stage.addEventListener('pointerdown', (e) => {
    if (card.contains(e.target)) return;
    const [sx, sy] = local(e);
    const i = nodeAt(sx, sy);
    drag = { i, sx, sy, cam: camera.position.clone(), moved: false };
    stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener('pointermove', (e) => {
    const [sx, sy] = local(e);
    if (drag) {
      if (Math.hypot(sx - drag.sx, sy - drag.sy) > 3) { drag.moved = true; stage.classList.add('dragging'); tip.hidden = true; }
      if (!drag.moved) return;
      if (drag.i != null) {
        const n = graph.nodes[drag.i];
        [n.fx, n.fy] = world(sx, sy);
        sim.reheat(0.3);
      } else {
        camera.position.set(drag.cam.x - (sx - drag.sx) / camera.zoom, drag.cam.y + (sy - drag.sy) / camera.zoom, 5);
      }
      dirty = true;
      return;
    }
    const i = nodeAt(sx, sy);
    if (i !== hover) { hover = i; paint(); }
    stage.style.cursor = i != null ? 'pointer' : '';
    tip.hidden = i == null || graph.nodes[i].kind !== 'decision';
    if (!tip.hidden) {
      const d = graph.nodes[i].decision;
      tip.replaceChildren(h('b', null, d.phase), h('br'), d.decision, h('br'), '→ ' + d.result);
      tip.style.left = Math.min(sx + 14, w - tip.offsetWidth - 4) + 'px';
      tip.style.top = sy + 14 + 'px';
    }
  });
  stage.addEventListener('pointerleave', () => { if (!drag) { hover = null; tip.hidden = true; paint(); } });
  stage.addEventListener('pointerup', (e) => {
    if (!drag) return;
    const [sx, sy] = local(e);
    if (drag.i != null) {
      const n = graph.nodes[drag.i];
      n.fx = n.fy = null; // let go, like Obsidian: the node rejoins the layout
      if (!drag.moved) showCard(drag.i);
    } else if (!drag.moved && !card.contains(e.target)) {
      card.hidden = true; active = null; paint();
    }
    drag = null;
    stage.classList.remove('dragging');
    hover = nodeAt(sx, sy);
    paint();
  });
  stage.addEventListener('dblclick', (e) => { if (!card.contains(e.target)) fit(); });
  stage.addEventListener('wheel', (e) => {
    e.preventDefault();
    const [sx, sy] = local(e);
    const [wx, wy] = world(sx, sy);
    camera.zoom = Math.min(8, Math.max(0.15, camera.zoom * Math.exp(-e.deltaY * 0.0015)));
    camera.updateProjectionMatrix();
    const [nx, ny] = world(sx, sy); // keep the point under the cursor still
    camera.position.x += wx - nx;
    camera.position.y += wy - ny;
    dirty = true;
  }, { passive: false });

  return {
    recolor() { colors = tokens(); paint(); },
    update(tree) {
      const next = JSON.stringify(tree);
      if (next === key) return;
      key = next;
      build(tree);
    },
  };
}
