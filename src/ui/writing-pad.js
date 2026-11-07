import { h } from '../core/dom.js';

export const RULES = Object.freeze([['top', 40], ['middle', 200], ['base', 360]]);
export const RULE_HEIGHT = 480;
export const INK_STEP = 2;
export const INK_WIDTH = 18;
export const SVG_NS = 'http://www.w3.org/2000/svg';
export const USE_PAPER = 'Use paper today';

export const PADS = Object.freeze({
  word: Object.freeze({ w: 900, h: 480, lines: 1 }),
  dictated: Object.freeze({ w: 1100, h: 360, lines: 1, ink: 14 }),
  sentence: Object.freeze({ w: 1400, h: 480, lines: 2, ink: 12 }),
  sound: Object.freeze({ w: 480, h: 480, lines: 1 }),
});



const round1 = ( v) => Math.round(v * 10) / 10;

function band(top, height) {
  return RULES.map(([name, y]) => ({ name: String(name), y: round1(top + (Number(y) / RULE_HEIGHT) * height) }));
}

export function padLayout(spec) {
  const w = Math.max(1, Number(spec?.w) || 1);
  const tall = Math.max(1, Number(spec?.h) || 1);
  const raw = spec?.lines ?? true;
  let lines = [];
  if (Array.isArray(raw)) {
    lines = raw.map((line, i) => (Array.isArray(line) ? { name: String(line[0]), y: Number(line[1]) } : { name: `line${i + 1}`, y: Number(line) }))
      .filter((l) => Number.isFinite(l.y) && l.y >= 0 && l.y <= tall);
  } else if (raw !== false && raw !== 0) {
    const bands = raw === true ? 1 : Math.max(1, Math.min(4, Math.floor(Number(raw)) || 1));
    for (let i = 0; i < bands; i++) lines.push(...band((tall / bands) * i, tall / bands));
  }
  const dividers = [...new Set((spec?.dividers ?? []).map(Number).filter((x) => Number.isFinite(x) && x > 0 && x < w).map(round1))].sort((a, b) => a - b);
  const ink = Number(spec?.ink) > 0 ? Number(spec.ink) : INK_WIDTH;
  return { w, h: tall, lines, dividers, ink };
}

export function syllableDividers(parts, w, margin = 60) {
  const sizes = parts.map((p) => String(p).length).filter((n) => n > 0);
  const total = sizes.reduce((sum, n) => sum + n, 0);
  if (sizes.length < 2 || total === 0) return [];
  const span = Math.max(0, w - margin * 2);
  let seen = 0;
  const xs = [];
  for (let i = 0; i < sizes.length - 1; i++) {
    seen += sizes[i];
    xs.push(round1(margin + (seen / total) * span));
  }
  return xs;
}

export function wordGuide(text, layout) {
  const base = layout.lines.find((l) => l.name === 'base') ?? layout.lines[0];
  const bands = Math.max(1, layout.lines.filter((l) => l.name === 'base').length);
  const tall = layout.h / bands;
  const letters = Math.max(1, [...String(text)].length);
  const size = Math.round(Math.min((tall * 330) / RULE_HEIGHT, (layout.w * 0.9) / (letters * 0.56)));
  return { x: round1(layout.w / 2), y: round1(base?.y ?? layout.h * 0.75), size };
}

export function padPoint({ clientX, clientY }, rect, box) {
  const scale = Math.min(rect.width / box.w, rect.height / box.h) || 1;
  const left = rect.left + (rect.width - box.w * scale) / 2;
  const top = rect.top + (rect.height - box.h * scale) / 2;
  const clamp = ( v, max) => Math.min(max, Math.max(0, v));
  return [round1(clamp((clientX - left) / scale, box.w)), round1(clamp((clientY - top) / scale, box.h))];
}

export function addPoint(points, p) {
  const last = points.at(-1);
  if (last && Math.hypot(p[0] - last[0], p[1] - last[1]) < INK_STEP) return false;
  points.push(p);
  return true;
}

export function inkPath(points) {
  if (points.length === 0) return '';
  const n = ( v) => String(round1(v));
  const [x0, y0] = points[0];
  if (points.length === 1) return `M${n(x0)} ${n(y0)} L${n(x0 + 0.1)} ${n(y0)}`;
  let d = `M${n(x0)} ${n(y0)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [x, y] = points[i];
    const [nx, ny] = points[i + 1];
    d += ` Q${n(x)} ${n(y)} ${n((x + nx) / 2)} ${n((y + ny) / 2)}`;
  }
  const [xl, yl] = points.at(-1) ?? points[0];
  return `${d} L${n(xl)} ${n(yl)}`;
}

const xmlEscape = (text) => String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c] ?? c);

export function writingPad(spec, { guide = '', height = 272, label = 'Writing pad. Write here with a finger, a stylus or the mouse.', onStroke, onPaper } = {}) {
  const box = padLayout(spec);
  const rules = box.lines.map((l) => `<line class="wp-rule ${xmlEscape(l.name)}" x1="0" x2="${box.w}" y1="${l.y}" y2="${l.y}"/>`).join('');
  const top = box.lines.length > 0 ? Math.min(...box.lines.map((l) => l.y)) : 0;
  const foot = box.lines.length > 0 ? Math.max(...box.lines.map((l) => l.y)) : box.h;
  const dividers = box.dividers.map((x) => `<line class="wp-divider" x1="${x}" x2="${x}" y1="${top}" y2="${foot}"/>`).join('');
  const markup = `<svg xmlns="${SVG_NS}" viewBox="0 0 ${box.w} ${box.h}" aria-hidden="true"><g class="wp-rules">${rules}</g><g class="wp-dividers">${dividers}</g><g class="wp-guide"></g><g class="wp-ink" stroke-width="${box.ink}"></g></svg>`;
  const parsed = new globalThis.DOMParser().parseFromString(markup, 'image/svg+xml');
  const svg = (document.importNode(parsed.documentElement, true));
  svg.classList.add('wp-svg');
  if (guide) {
    const spot = wordGuide(guide, box);
    const text = document.createElementNS(SVG_NS, 'text');
    text.setAttribute('x', String(spot.x));
    text.setAttribute('y', String(spot.y));
    text.setAttribute('font-size', String(spot.size));
    text.setAttribute('text-anchor', 'middle');
    text.textContent = guide;
    svg.querySelector('.wp-guide')?.append(text);
  }
  const ink = (svg.querySelector('.wp-ink'));
  const pad = h('div', { class: 'wp-pad', role: 'group', 'aria-label': label,
    style: { '--w': String(box.w), '--h': String(box.h), '--ph': `${height}px` } }, svg);

  let stroke = null;
  let drawn = [];
  const at = (event) => padPoint(event, (stroke).rect, box);
  pad.addEventListener('pointerdown', ( event) => {
    if (stroke || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault?.();
    pad.setPointerCapture?.(event.pointerId);
    const r = pad.getBoundingClientRect?.() ?? { left: 0, top: 0, width: box.w, height: box.h };
    const path = (document.createElementNS(SVG_NS, 'path'));
    stroke = { id: event.pointerId, points: [], path, rect: { left: r.left, top: r.top, width: r.width, height: r.height } };
    addPoint(stroke.points, at(event));
    path.setAttribute('d', inkPath(stroke.points));
    ink.append(path);
    drawn.push(stroke.points);
  });
  pad.addEventListener('pointermove', ( event) => {
    if (!stroke || event.pointerId !== stroke.id) return;
    event.preventDefault?.();
    const events = event.getCoalescedEvents?.() ?? [];
    let added = false;
    for (const e of events.length > 0 ? events : [event]) added = addPoint(stroke.points, at(e)) || added;
    if (added) stroke.path.setAttribute('d', inkPath(stroke.points));
  });
  const lift = (event) => {
    if (!stroke || event.pointerId !== stroke.id) return;
    stroke = null;
    onStroke?.(drawn.length);
  };
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) pad.addEventListener(type, lift);
  pad.addEventListener('contextmenu', ( event) => { event.preventDefault?.(); });
  const clear = () => { stroke = null; drawn = []; ink.replaceChildren(); };
  const eraser = h('button', { type: 'button', class: 'wp-eraser', 'aria-label': 'Wipe it clean', onClick: clear },
    h('span', { class: 'wp-eraser-art', 'aria-hidden': 'true' }));
  const paper = onPaper ? paperButton(onPaper) : null;
  const el = h('div', { class: 'wp-row' }, pad, h('div', { class: 'wp-side' }, eraser, paper));
  return {
    el, pad, clear, box, eraser,
    strokes: () => drawn.length,
    paths: () => drawn.map(inkPath),
  };
}

export function inkThumbnail(paths, box, height = 56) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${box.w} ${box.h}`);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'wp-thumb-svg');
  svg.setAttribute('stroke-width', String(Math.round(box.ink * 1.6)));
  for (const d of paths) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return h('span', { class: 'wp-thumb', role: 'img', 'aria-label': 'What was written on the screen',
    style: { '--w': String(box.w), '--h': String(box.h), '--ph': `${height}px` } }, svg);
}


export function writesOnScreen(ctx) {
  if (ctx?.settings?.writeOnScreen === false) return false;
  return !(ctx && ctx.paperToday !== undefined && ctx.paperToday === (ctx.day ?? true));
}

export function usePaperToday(ctx) {
  if (ctx) ctx.paperToday = ctx.day ?? true;
}

export function paperButton(onPaper) {
  const button = h('button', { type: 'button', class: 'wp-paper', onClick: ( event) => {
    if ((event?.detail ?? 0) >= 2 || button.hidden) return;
    button.hidden = true;
    onPaper();
  } }, USE_PAPER);
  return button;
}
