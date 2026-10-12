// Swimlane timeline in three.js: one lane per agent, time left to right, the orchestrator's
// decisions and checks marked on the top lane. Drawn in screen pixels with an orthographic
// camera, so lines stay one pixel wide at any zoom.
import * as THREE from 'three';
import { swimlanes } from './layout.js';
import { clock, h, short } from './ui.js';

const LANE = 20, AXIS = 24, BAR = 10;
const STEPS = [1, 5, 10, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 10800, 21600].map((s) => s * 1000);

const tokens = () => {
  const css = getComputedStyle(document.documentElement);
  const c = (name) => new THREE.Color(css.getPropertyValue(name).trim());
  return { ink: c('--ink'), mid: c('--mid'), line: c('--line'), faint: c('--faint'), sel: c('--sel') };
};

export function createSwimlane({ labels, plot, axis, tip }, { onSelect, roleOf }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(devicePixelRatio);
  plot.prepend(renderer.domElement);
  const camera = new THREE.OrthographicCamera(0, 1, 0, -1, -10, 10);
  const scene = new THREE.Scene();
  const unit = new THREE.PlaneGeometry(1, 1).translate(0.5, -0.5, 0); // top-left anchored
  const outline = new THREE.BufferGeometry().setFromPoints([[0, 0], [1, 0], [1, -1], [0, -1]].map(([x, y]) => new THREE.Vector3(x, y, 0)));
  const diamond = new THREE.PlaneGeometry(6, 6).rotateZ(Math.PI / 4);

  let model = null;      // swimlanes() output
  let view = null;       // [v0, v1] when the user has zoomed or panned; null follows the data
  let selected = null;
  let colors = tokens();
  let items = [];        // { kind, mesh(es), lane, bar|mark }
  let w = 1, hgt = 1;
  let dirty = true;

  const group = new THREE.Group();
  scene.add(group);
  const grid = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial());
  const guides = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ transparent: true, opacity: 0.5 }));
  const nowLine = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial());
  const selBand = new THREE.Mesh(unit, new THREE.MeshBasicMaterial());
  scene.add(grid, guides, nowLine, selBand);


  function range() {
    if (view) return view;
    const pad = (model.t1 - model.t0) * 0.02 || 1000;
    return [model.t0 - pad, model.t1 + pad];
  }
  const xOf = (t) => { const [a, b] = range(); return ((t - a) / (b - a)) * w; };
  const tOf = (x) => { const [a, b] = range(); return a + (x / w) * (b - a); };
  const yOf = (lane) => AXIS + lane * LANE;

  function clear() {
    for (const it of items) for (const m of it.meshes) { group.remove(m); m.material.dispose(); }
    items = [];
  }

  function rebuild() {
    if (!model) return;
    clear();
    model.lanes.forEach((lane, i) => {
      const b = lane.bar;
      if (!b) return;
      const meshes = [];
      const filled = b.status === 'PASS' || b.status === 'ISSUES' || b.running;
      if (filled) {
        const m = new THREE.Mesh(unit, new THREE.MeshBasicMaterial({ color: b.status === 'ISSUES' ? colors.mid : colors.ink, transparent: b.running, opacity: b.running ? 0.35 : 1 }));
        meshes.push(m);
      }
      if (!filled || b.running) meshes.push(new THREE.LineLoop(outline, new THREE.LineBasicMaterial({ color: colors.ink })));
      meshes.forEach((m) => group.add(m));
      items.push({ kind: 'bar', meshes, lane: i, bar: b, agent: lane.agent });
    });
    for (const mk of model.marks) {
      const meshes = [];
      if (mk.kind === 'decision') meshes.push(new THREE.Mesh(diamond, new THREE.MeshBasicMaterial({ color: colors.ink })));
      else if (mk.result === 'pass') meshes.push(new THREE.Mesh(unit, new THREE.MeshBasicMaterial({ color: colors.ink })));
      else meshes.push(new THREE.LineLoop(outline, new THREE.LineBasicMaterial({ color: colors.ink })));
      meshes.forEach((m) => group.add(m));
      items.push({ kind: mk.kind, meshes, lane: 0, mark: mk });
    }
    grid.material.color = colors.line;
    guides.material.color = colors.faint;
    nowLine.material.color = colors.mid;
    selBand.material.color = colors.sel;
    labels.replaceChildren(h('div', { class: 'axis-pad' }), ...model.lanes.map((lane) => {
      const row = h('div', { class: lane.agent === selected ? 'sel' : null, title: lane.agent },
        lane.bar ? h('span', { class: 'st ' + lane.status }) : null,
        lane.label, ' ', lane.label === lane.agent ? null : h('code', null, short(lane.agent)));
      row.addEventListener('click', () => onSelect(lane.agent));
      return row;
    }));
    resize();
  }

  function resize() {
    w = Math.max(1, plot.clientWidth);
    hgt = AXIS + Math.max(1, model?.lanes.length ?? 1) * LANE + 6;
    plot.style.height = hgt + 'px';
    renderer.setSize(w, hgt);
    Object.assign(camera, { left: 0, right: w, top: 0, bottom: -hgt });
    camera.updateProjectionMatrix();
    dirty = true;
  }
  new ResizeObserver(resize).observe(plot);

  function lines(target, segs) {
    target.geometry.setAttribute('position', new THREE.Float32BufferAttribute(segs.flatMap(([x1, y1, x2, y2]) => [x1, -y1, 0, x2, -y2, 0]), 3));
    target.geometry.computeBoundingSphere();
  }

  function layoutFrame(now) {
    const pulse = 0.25 + 0.2 * Math.sin(now / 250);
    for (const it of items) {
      if (it.bar) {
        const end = it.bar.running ? Date.now() : it.bar.end;
        const x0 = xOf(it.bar.start), x1 = Math.max(x0 + 2, xOf(end));
        const y = yOf(it.lane) + (LANE - BAR) / 2;
        for (const m of it.meshes) {
          m.position.set(x0, -y, 0);
          m.scale.set(x1 - x0, BAR, 1);
          if (it.bar.running && m.isMesh) m.material.opacity = pulse;
        }
      } else {
        const x = xOf(it.mark.t), mid = yOf(0) + LANE / 2;
        for (const m of it.meshes) {
          if (it.kind === 'decision') { m.position.set(x, -mid, 1); m.scale.set(1, 1, 1); }
          else { m.position.set(x - 1.5, -(mid - 6), 1); m.scale.set(3, 12, 1); }
        }
      }
    }
    // time grid and axis labels
    const [a, b] = range();
    const step = STEPS.find((s) => (s / (b - a)) * w >= 90) ?? STEPS.at(-1);
    const ticks = [];
    for (let t = Math.ceil(a / step) * step; t <= b; t += step) ticks.push(t);
    lines(grid, [...ticks.map((t) => [xOf(t), AXIS, xOf(t), hgt]), ...(model?.lanes ?? []).map((_, i) => [0, yOf(i + 1), w, yOf(i + 1)])]);
    axis.replaceChildren(...ticks.map((t) => h('span', { style: `left:${xOf(t)}px` }, step >= 60000 ? clock(new Date(t).toISOString()).slice(0, 5) : clock(new Date(t).toISOString()))));
    // a faint line down every lane at each decision, to see what each wave followed
    lines(guides, (model?.marks ?? []).filter((m) => m.kind === 'decision').map((m) => [xOf(m.t), yOf(1), xOf(m.t), hgt]));
    const live = model?.lanes.some((l) => l.bar?.running);
    lines(nowLine, live ? [[xOf(Date.now()), AXIS, xOf(Date.now()), hgt]] : []);
    const si = model?.lanes.findIndex((l) => l.agent === selected) ?? -1;
    selBand.visible = si >= 0;
    if (si >= 0) { selBand.position.set(0, -yOf(si), -1); selBand.scale.set(w, LANE, 1); }
  }

  function frame(now) {
    const live = model?.lanes.some((l) => l.bar?.running);
    if (model && (dirty || live)) {
      layoutFrame(now);
      renderer.render(scene, camera);
      dirty = false;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // Hit test in screen pixels: a mark on the top lane, else the bar in the lane under the cursor.
  function hit(x, y) {
    const lane = Math.floor((y - AXIS) / LANE);
    if (lane === 0) {
      let best = null, bd = 7;
      for (const it of items) if (it.mark) { const d = Math.abs(xOf(it.mark.t) - x); if (d < bd) { bd = d; best = it; } }
      if (best) return best;
    }
    return items.find((it) => it.bar && it.lane === lane && x >= xOf(it.bar.start) - 3 && x <= xOf(it.bar.running ? Date.now() : it.bar.end) + 3) ?? null;
  }

  const fmt = (t) => clock(new Date(t).toISOString());
  const dur = (ms) => { const s = Math.round(ms / 1000); return s < 60 ? s + 's' : Math.floor(s / 60) + 'm ' + (s % 60) + 's'; };
  function describe(it) {
    if (it.bar) {
      const end = it.bar.running ? Date.now() : it.bar.end;
      return [h('b', null, roleOf(it.agent)), ` · ${it.bar.status}`, h('br'), `${fmt(it.bar.start)} – ${it.bar.running ? 'now' : fmt(end)} (${dur(end - it.bar.start)})`];
    }
    const e = it.mark.event;
    if (it.kind === 'decision') return [h('b', null, e.phase), h('br'), e.decision, h('br'), '→ ' + e.result];
    return [h('b', null, `check ${e.name}: ${e.result}`), h('br'), e.evidence];
  }

  let drag = null;
  const local = (e) => { const r = plot.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  plot.addEventListener('pointerdown', (e) => {
    const [x] = local(e);
    drag = { x0: x, range: range(), moved: false };
    plot.setPointerCapture(e.pointerId);
  });
  plot.addEventListener('pointermove', (e) => {
    const [x, y] = local(e);
    if (drag) {
      if (Math.abs(x - drag.x0) > 3) { drag.moved = true; plot.classList.add('dragging'); tip.hidden = true; }
      if (drag.moved) {
        const [a, b] = drag.range, dt = ((x - drag.x0) / w) * (b - a);
        view = [a - dt, b - dt];
        dirty = true;
      }
      return;
    }
    const it = hit(x, y);
    tip.hidden = !it;
    if (it) {
      tip.replaceChildren(...describe(it));
      tip.style.left = Math.min(x + 12, w - tip.offsetWidth - 4) + 'px';
      tip.style.top = y + 14 + 'px';
    }
  });
  plot.addEventListener('pointerleave', () => { tip.hidden = true; });
  plot.addEventListener('pointerup', (e) => {
    const [x, y] = local(e);
    if (drag && !drag.moved) {
      const it = hit(x, y);
      onSelect(it?.bar ? it.agent : null);
    }
    drag = null;
    plot.classList.remove('dragging');
  });
  plot.addEventListener('dblclick', () => { view = null; dirty = true; });
  // ctrl + scroll (and trackpad pinch) zooms around the cursor; a sideways scroll pans.
  plot.addEventListener('wheel', (e) => {
    const [x] = local(e);
    const [a, b] = range();
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const t = tOf(x), k = Math.exp(e.deltaY * 0.002);
      view = [t - (t - a) * k, t + (b - t) * k];
      dirty = true;
    } else if (Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.shiftKey) {
      e.preventDefault();
      const d = ((e.shiftKey ? e.deltaY : e.deltaX) / w) * (b - a);
      view = [a + d, b + d];
      dirty = true;
    }
  }, { passive: false });

  return {
    recolor() { colors = tokens(); rebuild(); },
    update(state) {
      const next = swimlanes(state, Date.now());
      if (model && state.run !== model.run) view = null;
      model = { ...next, run: state.run };
      rebuild();
    },
    setSelected(agent) {
      selected = agent;
      for (const [i, row] of [...labels.children].slice(1).entries()) row.classList.toggle('sel', model.lanes[i]?.agent === agent);
      dirty = true;
    },
  };
}
