// Decision graph in 3-D, after Obsidian's graph view: grey spheres, thin links, a force layout
// that keeps moving while it settles, distance fog for depth. Drag to orbit (it turns on its
// own when idle), hover lights a node and its neighbours, click opens its card, drag a node
// to move it. Cross-links (supersedes, mentions, evidence) are layers that can be hidden.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildGraph, createSimulation } from './layout.js';
import { clock, h } from './ui.js';

const tokens = () => {
  const css = getComputedStyle(document.documentElement);
  const c = (name) => new THREE.Color(css.getPropertyValue(name).trim());
  return { bg: c('--panel'), node: c('--g-node'), leaf: c('--g-leaf'), link: c('--g-link'), hi: c('--g-hi'), dim: c('--g-dim') };
};

const KINDS = ['tree', 'supersedes', 'mentions', 'evidence'];
const radius = (n) => (n.kind === 'root' ? 10 : n.kind === 'phase' ? Math.min(16, 3.6 + 2.2 * Math.sqrt(n.count)) : n.kind === 'evidence' ? 4 : 2.8);
const IDLE_MS = 30_000;

export function createGraph({ stage, labels, tip, card }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(devicePixelRatio);
  stage.prepend(renderer.domElement);
  const canvas = renderer.domElement;
  const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 20000);
  const scene = new THREE.Scene();
  scene.add(camera);
  scene.add(new THREE.AmbientLight(0xffffff, 1.3));
  const sun = new THREE.DirectionalLight(0xffffff, 1.7);
  sun.position.set(0.5, 1, 1);
  camera.add(sun); // light from the viewer, so shading reads the same from every side
  const sphere = new THREE.SphereGeometry(1, 20, 14);
  const cube = new THREE.BoxGeometry(1.5, 1.5, 1.5);
  const cone = new THREE.ConeGeometry(1.4, 4.5, 10);

  let colors = tokens();
  scene.fog = new THREE.Fog(colors.bg, 100, 1000);
  let graph = null, sim = null, key = '';
  let meshes = [], spans = [], neighbours = [], arrows = [];
  let hover = null, active = null; // hovered node index; node whose card is open
  let w = 1, hgt = 1, fitted = false, viewDist = 400, lastTouch = 0;
  const shown = { tree: true, supersedes: true, mentions: true, evidence: false };

  const lines = {
    tree: new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial()),
    supersedes: new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ dashSize: 3, gapSize: 2 })),
    mentions: new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ dashSize: 0.8, gapSize: 2.6 })),
    evidence: new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ transparent: true, opacity: 0.5 })),
  };
  const hiLines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial());
  scene.add(...Object.values(lines), hiLines);

  // Ours go first: a press on a node turns the orbit controls off before they see it.
  canvas.addEventListener('pointerdown', onDown);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.5;
  controls.addEventListener('start', () => { controls.autoRotate = false; lastTouch = performance.now(); tip.hidden = true; });
  controls.addEventListener('end', () => { lastTouch = performance.now(); });

  function resize() {
    w = Math.max(1, stage.clientWidth);
    hgt = Math.max(1, stage.clientHeight);
    renderer.setSize(w, hgt);
    camera.aspect = w / hgt;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(stage);
  resize();

  const visible = (n) => n.kind !== 'evidence' || shown.evidence;

  function fit() {
    if (!graph) return;
    const pts = graph.nodes.filter(visible);
    const c = new THREE.Vector3();
    for (const n of pts) c.add(new THREE.Vector3(n.x, n.y, n.z));
    c.divideScalar(Math.max(1, pts.length));
    // frame most of the graph: a few outliers should not shrink everything else
    const ds = pts.map((n) => Math.hypot(n.x - c.x, n.y - c.y, n.z - c.z)).sort((a, b) => a - b);
    const r = Math.max(40, ds[Math.floor(ds.length * 0.92)] ?? 0);
    viewDist = (r / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2))) * 1.05;
    const dir = camera.position.clone().sub(controls.target).normalize();
    if (!dir.lengthSq()) dir.set(0, 0.25, 1).normalize();
    controls.target.copy(c);
    camera.position.copy(c).addScaledVector(dir, viewDist);
    camera.near = Math.max(0.5, viewDist / 200);
    camera.far = viewDist * 6;
    camera.updateProjectionMatrix();
    scene.fog.near = viewDist - r * 0.4;
    scene.fog.far = viewDist + r * 1.6;
    controls.update();
  }

  function build(tree) {
    const prev = new Map((graph?.nodes ?? []).map((n) => [n.id, n]));
    for (const m of [...meshes, ...arrows]) { scene.remove(m); m.material.dispose(); }
    graph = buildGraph(tree);
    for (const n of graph.nodes) { const p = prev.get(n.id); if (p) Object.assign(n, { x: p.x, y: p.y, z: p.z }); }
    sim = createSimulation(graph.nodes, graph.links);
    if (!prev.size) for (let i = 0; i < 300; i++) sim.tick(); // open on a settled layout
    neighbours = graph.nodes.map(() => new Set());
    for (const l of graph.links) { neighbours[l.source].add(l.target); neighbours[l.target].add(l.source); }
    meshes = graph.nodes.map((n, i) => {
      const m = new THREE.Mesh(n.kind === 'evidence' ? cube : sphere, new THREE.MeshLambertMaterial());
      m.scale.setScalar(radius(n));
      m.userData.i = i;
      scene.add(m);
      return m;
    });
    arrows = graph.links.filter((l) => l.kind === 'supersedes').map((l) => {
      const m = new THREE.Mesh(cone, new THREE.MeshLambertMaterial());
      m.userData.link = l;
      scene.add(m);
      return m;
    });
    for (const k of KINDS) {
      const n = graph.links.filter((l) => l.kind === k).length;
      lines[k].geometry.dispose();
      lines[k].geometry = new THREE.BufferGeometry();
      lines[k].geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n * 6), 3));
    }
    spans = graph.nodes.map((n) => h('span', { style: 'opacity:0' }, n.kind === 'decision' ? trim(n.label, 48) : n.label));
    labels.replaceChildren(...spans);
    hover = null; active = null; card.hidden = true;
    paint();
    if (!fitted) { fit(); fitted = true; }
  }

  const trim = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

  const linkShown = (a, b) => graph.links.some((l) => shown[l.kind] && ((l.source === a && l.target === b) || (l.source === b && l.target === a)));
  function lit() {
    const focus = hover ?? active;
    if (focus == null) return null;
    return new Set([focus, ...[...neighbours[focus]].filter((j) => visible(graph.nodes[j]) && linkShown(focus, j))]);
  }

  function paint() {
    if (!graph) return;
    const on = lit();
    graph.nodes.forEach((n, i) => {
      const base = n.kind === 'decision' ? colors.leaf : colors.node;
      meshes[i].material.color = on ? (on.has(i) ? colors.hi : colors.dim) : base;
      meshes[i].visible = visible(n);
    });
    lines.tree.material.color = on ? colors.dim : colors.link;
    lines.supersedes.material.color = on ? colors.dim : colors.hi;
    lines.mentions.material.color = on ? colors.dim : colors.leaf;
    lines.evidence.material.color = on ? colors.dim : colors.link;
    for (const a of arrows) { a.material.color = on ? colors.dim : colors.hi; a.visible = shown.supersedes; }
    for (const k of KINDS) lines[k].visible = shown[k];
    hiLines.material.color = colors.hi;
    scene.fog.color = colors.bg;
  }

  const up = new THREE.Vector3(0, 1, 0);
  function place() {
    const counts = Object.fromEntries(KINDS.map((k) => [k, 0]));
    for (const l of graph.links) {
      const s = graph.nodes[l.source], t = graph.nodes[l.target];
      const pos = lines[l.kind].geometry.attributes.position, k = counts[l.kind]++;
      pos.setXYZ(2 * k, s.x, s.y, s.z);
      pos.setXYZ(2 * k + 1, t.x, t.y, t.z);
    }
    for (const k of KINDS) {
      const g = lines[k].geometry;
      g.attributes.position.needsUpdate = true;
      g.computeBoundingSphere();
      if (lines[k].material.isLineDashedMaterial) lines[k].computeLineDistances();
    }
    graph.nodes.forEach((n, i) => meshes[i].position.set(n.x, n.y, n.z));
    // the arrowhead sits just short of the replaced row, pointing at it
    for (const a of arrows) {
      const s = graph.nodes[a.userData.link.source], t = graph.nodes[a.userData.link.target];
      const dir = new THREE.Vector3(t.x - s.x, t.y - s.y, t.z - s.z).normalize();
      a.position.set(t.x, t.y, t.z).addScaledVector(dir, -(radius(t) + 3));
      a.quaternion.setFromUnitVectors(up, dir);
    }
    const focus = hover ?? active;
    const on = focus == null ? [] : graph.links.filter((l) => shown[l.kind] && (l.source === focus || l.target === focus) && visible(graph.nodes[l.source]) && visible(graph.nodes[l.target]));
    hiLines.geometry.setAttribute('position', new THREE.Float32BufferAttribute(on.flatMap((l) => {
      const s = graph.nodes[l.source], t = graph.nodes[l.target];
      return [s.x, s.y, s.z, t.x, t.y, t.z];
    }), 3));
    labelsFrame(focus);
  }

  // HTML labels follow their nodes: hubs always, every phase once the camera is close, anything
  // lit; the far side fades with the fog.
  const v = new THREE.Vector3();
  function labelsFrame(focus) {
    const set = lit();
    const close = camera.position.distanceTo(controls.target) < viewDist * 0.6;
    const halfTan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    graph.nodes.forEach((n, i) => {
      const el = spans[i];
      v.set(n.x, n.y, n.z);
      const depth = camera.position.distanceTo(v);
      v.project(camera);
      const wanted = set
        ? set.has(i) && (n.kind === 'phase' || n.kind === 'root' || i === focus)
        : n.kind === 'root' || (n.kind === 'phase' && (n.count >= 6 || close));
      const fade = THREE.MathUtils.clamp((scene.fog.far - depth) / Math.max(1, scene.fog.far - scene.fog.near), 0.15, 1);
      const show = wanted && visible(n) && v.z < 1;
      el.style.opacity = show ? (set ? 1 : fade) : 0;
      el.className = set?.has(i) ? 'hi' : '';
      if (show) {
        el.style.left = ((v.x + 1) / 2) * w + 'px';
        el.style.top = ((1 - v.y) / 2) * hgt + (radius(n) * hgt) / (2 * depth * halfTan) + 4 + 'px';
      }
    });
  }

  function frame(now) {
    if (sim && !sim.settled()) sim.tick();
    if (!controls.autoRotate && !drag && now - lastTouch > IDLE_MS) controls.autoRotate = true;
    controls.update();
    if (graph) place();
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const local = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  function pick(sx, sy) {
    if (!graph) return null;
    ndc.set((sx / w) * 2 - 1, -(sy / hgt) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(meshes.filter((m) => m.visible), false)[0];
    return hit ? hit.object.userData.i : null;
  }

  function showCard(i) {
    active = i;
    const n = graph.nodes[i];
    const cross = (kind) => graph.links.filter((l) => l.kind === kind && (l.source === i || l.target === i));
    if (n.kind === 'decision') {
      const d = n.decision;
      const rel = [
        ...cross('supersedes').map((l) => (l.source === i ? 'supersedes line ' + graph.nodes[l.target].decision.line : 'superseded by line ' + graph.nodes[l.source].decision.line)),
        ...cross('mentions').map((l) => 'mentions ' + graph.nodes[l.target].label),
        ...cross('evidence').map((l) => 'shares evidence ' + graph.nodes[l.source].label),
      ];
      card.replaceChildren(closeButton(), h('code', null, d.phase + ' · line ' + d.line + ' · ' + clock(d.ts)),
        h('div', { class: 'k' }, 'decision'), h('div', null, d.decision),
        h('div', { class: 'k' }, 'why'), h('div', null, d.why),
        h('div', { class: 'k' }, 'result'), h('div', null, d.result),
        h('div', { class: 'k' }, 'evidence'), h('div', { class: 'mono' }, d.evidence),
        ...(rel.length ? [h('div', { class: 'k' }, 'links'), ...rel.map((r) => h('div', null, r))] : []));
    } else if (n.kind === 'evidence') {
      card.replaceChildren(closeButton(), h('b', null, n.label), ' ', h('span', { class: 'muted' }, 'cited by ' + n.count + ' decisions'),
        h('div', { class: 'mono' }, n.source),
        ...cross('evidence').map((l) => graph.nodes[l.target].decision).map((d) => h('div', { class: 'dec' }, h('code', null, d.phase), ' ', d.decision)));
    } else {
      const kids = [...neighbours[i]].map((j) => graph.nodes[j]).filter((m) => m.kind === 'decision' && m.decision.phase === n.id);
      const mentioned = cross('mentions').map((l) => graph.nodes[l.source].decision);
      card.replaceChildren(closeButton(), h('b', null, n.id || 'all decisions'), ' ', h('span', { class: 'muted' }, n.count + ' decisions'),
        ...kids.map((m) => h('div', { class: 'dec' }, h('code', null, clock(m.decision.ts)), ' ', m.decision.decision)),
        ...(mentioned.length ? [h('div', { class: 'k' }, 'mentioned by'), ...mentioned.map((d) => h('div', { class: 'dec' }, h('code', null, d.phase), ' ', d.decision))] : []));
    }
    card.hidden = false;
    paint();
  }
  function closeButton() {
    const b = h('button', { class: 'x', title: 'close' }, '×');
    b.addEventListener('click', () => { card.hidden = true; active = null; paint(); });
    return b;
  }

  // Pressing a node drags it on the plane that faces the camera; pressing empty space orbits.
  let drag = null, press = null;
  const plane = new THREE.Plane();
  const hitPoint = new THREE.Vector3();
  function onDown(e) {
    const [sx, sy] = local(e);
    press = { sx, sy };
    const i = pick(sx, sy);
    if (i == null) return;
    controls.enabled = false;
    controls.autoRotate = false;
    lastTouch = performance.now();
    const n = graph.nodes[i];
    plane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()), new THREE.Vector3(n.x, n.y, n.z));
    drag = { i, moved: false };
    canvas.setPointerCapture(e.pointerId);
  }
  canvas.addEventListener('pointermove', (e) => {
    const [sx, sy] = local(e);
    if (drag) {
      if (Math.hypot(sx - press.sx, sy - press.sy) > 3) { drag.moved = true; stage.classList.add('dragging'); tip.hidden = true; }
      if (!drag.moved) return;
      ndc.set((sx / w) * 2 - 1, -(sy / hgt) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      if (ray.ray.intersectPlane(plane, hitPoint)) {
        Object.assign(graph.nodes[drag.i], { fx: hitPoint.x, fy: hitPoint.y, fz: hitPoint.z });
        sim.reheat(0.3);
      }
      return;
    }
    if (e.buttons) return; // orbiting
    const i = pick(sx, sy);
    if (i !== hover) { hover = i; paint(); }
    canvas.style.cursor = i != null ? 'pointer' : '';
    const n = i == null ? null : graph.nodes[i];
    tip.hidden = !n || (n.kind !== 'decision' && n.kind !== 'evidence');
    if (!tip.hidden) {
      tip.replaceChildren(...(n.kind === 'decision'
        ? [h('b', null, n.decision.phase), h('br'), n.decision.decision, h('br'), '→ ' + n.decision.result]
        : [h('b', null, n.label), h('br'), 'cited by ' + n.count + ' decisions in different phases']));
      tip.style.left = Math.min(sx + 14, w - tip.offsetWidth - 4) + 'px';
      tip.style.top = sy + 14 + 'px';
    }
  });
  canvas.addEventListener('pointerleave', () => { if (!drag) { hover = null; tip.hidden = true; paint(); } });
  canvas.addEventListener('pointerup', (e) => {
    const [sx, sy] = local(e);
    if (drag) {
      const n = graph.nodes[drag.i];
      n.fx = n.fy = n.fz = null; // let go, like Obsidian: the node rejoins the layout
      if (!drag.moved) showCard(drag.i);
      drag = null;
      controls.enabled = true;
      stage.classList.remove('dragging');
    } else if (press && Math.hypot(sx - press.sx, sy - press.sy) < 4) {
      card.hidden = true; active = null; paint();
    }
    press = null;
  });
  canvas.addEventListener('dblclick', () => fit());
  requestAnimationFrame(frame);

  return {
    recolor() { colors = tokens(); paint(); },
    setLayer(kind, on) { shown[kind] = on; paint(); },
    update(tree) {
      const next = JSON.stringify(tree);
      if (next === key) return;
      key = next;
      build(tree);
    },
  };
}
