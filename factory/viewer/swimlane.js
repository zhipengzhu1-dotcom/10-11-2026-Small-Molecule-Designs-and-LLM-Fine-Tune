// Swimlane timeline on a canvas: one lane per agent, time left to right, the orchestrator's
// decisions and checks marked on the top lane. Drawn in screen pixels, so lines stay one pixel
// wide at any zoom.
import { swimlanes } from './layout.js';
import { clock, h, short } from './ui.js';

const LANE = 20, AXIS = 24, BAR = 10;
const STEPS = [1, 5, 10, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 10800, 21600].map((s) => s * 1000);

const tokens = () => {
  const css = getComputedStyle(document.documentElement);
  const c = (name) => css.getPropertyValue(name).trim();
  return { ink: c('--ink'), mid: c('--mid'), line: c('--line'), faint: c('--faint'), sel: c('--sel') };
};

export function createSwimlane({ labels, plot, axis, tip }, { onSelect, roleOf }) {
  const canvas = h('canvas');
  plot.prepend(canvas);
  const ctx = canvas.getContext('2d');

  let model = null;      // swimlanes() output
  let view = null;       // [v0, v1] when the user has zoomed or panned; null follows the data
  let selected = null;
  let colors = tokens();
  let items = [];        // { kind, lane, bar | mark, agent }
  let w = 1, hgt = 1;
  let dirty = true;

  function range() {
    if (view) return view;
    const pad = (model.t1 - model.t0) * 0.02 || 1000;
    return [model.t0 - pad, model.t1 + pad];
  }
  const xOf = (t) => { const [a, b] = range(); return ((t - a) / (b - a)) * w; };
  const tOf = (x) => { const [a, b] = range(); return a + (x / w) * (b - a); };
  const yOf = (lane) => AXIS + lane * LANE;

  function rebuild() {
    if (!model) return;
    items = [
      ...model.lanes.flatMap((lane, i) => (lane.bar ? [{ kind: 'bar', lane: i, bar: lane.bar, agent: lane.agent }] : [])),
      ...model.marks.map((mk) => ({ kind: mk.kind, lane: 0, mark: mk })),
    ];
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
    canvas.width = Math.round(w * devicePixelRatio);
    canvas.height = Math.round(hgt * devicePixelRatio);
    canvas.style.width = w + 'px';
    canvas.style.height = hgt + 'px';
    dirty = true;
  }
  new ResizeObserver(resize).observe(plot);

  function segments(segs, color, alpha = 1) {
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    for (const [x1, y1, x2, y2] of segs) { ctx.moveTo(Math.round(x1) + 0.5, Math.round(y1) + 0.5); ctx.lineTo(Math.round(x2) + 0.5, Math.round(y2) + 0.5); }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function draw(now) {
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    ctx.clearRect(0, 0, w, hgt);
    ctx.lineWidth = 1;
    const si = model.lanes.findIndex((l) => l.agent === selected);
    if (si >= 0) { ctx.fillStyle = colors.sel; ctx.fillRect(0, yOf(si), w, LANE); }
    // time grid and axis labels
    const [a, b] = range();
    const step = STEPS.find((s) => (s / (b - a)) * w >= 90) ?? STEPS.at(-1);
    const ticks = [];
    for (let t = Math.ceil(a / step) * step; t <= b; t += step) ticks.push(t);
    segments([...ticks.map((t) => [xOf(t), AXIS, xOf(t), hgt]), ...model.lanes.map((_, i) => [0, yOf(i + 1), w, yOf(i + 1)])], colors.line);
    axis.replaceChildren(...ticks.map((t) => h('span', { style: `left:${xOf(t)}px` }, step >= 60000 ? clock(new Date(t).toISOString()).slice(0, 5) : clock(new Date(t).toISOString()))));
    // a faint line down every lane at each decision, to see what each wave followed
    segments(model.marks.filter((m) => m.kind === 'decision').map((m) => [xOf(m.t), yOf(1), xOf(m.t), hgt]), colors.faint, 0.5);
    if (model.lanes.some((l) => l.bar?.running)) segments([[xOf(Date.now()), AXIS, xOf(Date.now()), hgt]], colors.mid);
    const pulse = 0.25 + 0.2 * Math.sin(now / 250);
    for (const it of items) {
      if (it.bar) {
        const end = it.bar.running ? Date.now() : it.bar.end;
        const x0 = xOf(it.bar.start), x1 = Math.max(x0 + 2, xOf(end));
        const y = yOf(it.lane) + (LANE - BAR) / 2;
        const filled = it.bar.status === 'PASS' || it.bar.status === 'ISSUES' || it.bar.running;
        if (filled) {
          ctx.globalAlpha = it.bar.running ? pulse : 1;
          ctx.fillStyle = it.bar.status === 'ISSUES' ? colors.mid : colors.ink;
          ctx.fillRect(x0, y, x1 - x0, BAR);
          ctx.globalAlpha = 1;
        }
        if (!filled || it.bar.running) { ctx.strokeStyle = colors.ink; ctx.strokeRect(Math.round(x0) + 0.5, Math.round(y) + 0.5, Math.round(x1 - x0), BAR); }
        continue;
      }
      const x = xOf(it.mark.t), mid = yOf(0) + LANE / 2;
      ctx.fillStyle = ctx.strokeStyle = colors.ink;
      if (it.kind === 'decision') {
        ctx.beginPath();
        ctx.moveTo(x, mid - 4.2); ctx.lineTo(x + 4.2, mid); ctx.lineTo(x, mid + 4.2); ctx.lineTo(x - 4.2, mid);
        ctx.fill();
      } else if (it.mark.result === 'pass') ctx.fillRect(x - 1.5, mid - 6, 3, 12);
      else ctx.strokeRect(Math.round(x - 1.5) + 0.5, mid - 5.5, 3, 12);
    }
  }

  function frame(now) {
    const live = model?.lanes.some((l) => l.bar?.running);
    if (model && (dirty || live)) {
      draw(now);
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
