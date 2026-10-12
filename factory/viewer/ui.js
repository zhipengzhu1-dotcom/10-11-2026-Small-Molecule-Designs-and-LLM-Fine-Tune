// Small DOM and time helpers shared by the viewer's scripts.
// Builds an element. Every string goes in as text, never as HTML: event fields are untrusted.
export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) if (v != null) k === 'class' ? (el.className = v) : el.setAttribute(k, v);
  for (const k of kids.flat()) if (k != null) el.append(k instanceof Node ? k : String(k));
  return el;
}
export const short = (id) => (id && id.length > 12 ? id.slice(0, 8) : id);
export const clock = (ts) => (ts ? new Date(ts).toLocaleTimeString([], { hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '');
export function span(a, b) {
  if (!a) return '';
  const s = Math.max(0, Math.round(((b ? Date.parse(b) : Date.now()) - Date.parse(a)) / 1000));
  return s < 60 ? s + 's' : s < 3600 ? Math.floor(s / 60) + 'm ' + (s % 60) + 's' : Math.floor(s / 3600) + 'h ' + Math.floor((s % 3600) / 60) + 'm';
}
