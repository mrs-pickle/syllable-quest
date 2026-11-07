const W = 640;
const H = 230;
const PAD = { left: 56, right: 16, top: 16, bottom: 44 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;
const MAX_LABELS = 8;

export const esc = (text) => String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

const r1 = (n) => Math.round(n * 10) / 10;

function frame(max, fmt, xLabels, min = 0) {
  const y = ( v) => PAD.top + PLOT_H - ((v - min) / (max - min || 1)) * PLOT_H;
  const ticks = [min, (min + max) / 2, max];
  const grid = ticks.map((v) => `<line class="graph-grid" x1="${PAD.left}" x2="${W - PAD.right}" y1="${r1(y(v))}" y2="${r1(y(v))}"/>`
    + `<text class="graph-tick" x="${PAD.left - 8}" y="${r1(y(v) + 5)}" text-anchor="end">${esc(fmt(v))}</text>`).join('');
  const every = Math.max(1, Math.ceil(xLabels.length / MAX_LABELS));
  const labels = xLabels.filter((_, i) => (xLabels.length - 1 - i) % every === 0)
    .map((l) => `<text class="graph-label" x="${r1(l.x)}" y="${H - PAD.bottom + 24}" text-anchor="middle">${esc(l.label)}</text>`).join('');
  return { y, markup: `${grid}<line class="graph-axis" x1="${PAD.left}" x2="${W - PAD.right}" y1="${PAD.top + PLOT_H}" y2="${PAD.top + PLOT_H}"/>${labels}` };
}

const bar = ( x, w, top, bottom, cls, tip, rounded = true) => {
  const height = bottom - top;
  if (height <= 0) return '';
  const r = rounded ? Math.min(4, w / 2, height) : 0;
  const d = `M${r1(x)} ${r1(bottom)}V${r1(top + r)}Q${r1(x)} ${r1(top)} ${r1(x + r)} ${r1(top)}H${r1(x + w - r)}Q${r1(x + w)} ${r1(top)} ${r1(x + w)} ${r1(top + r)}V${r1(bottom)}Z`;
  return `<path class="${cls}" d="${d}"><title>${esc(tip)}</title></path>`;
};


export function barGraph(items, { max, fmt = (v) => String(Math.round(v)), grouped = false, title }) {
  const tallest = Math.max(1, ...items.map((it) => (grouped ? Math.max(0, ...it.parts.map((p) => p.value ?? 0)) : it.parts.reduce((n, p) => n + (p.value ?? 0), 0))));
  const top = max ?? niceMax(tallest);
  const slot = PLOT_W / Math.max(1, items.length);
  const width = Math.min(48, slot * 0.6);
  const { y, markup } = frame(top, fmt, items.map((it, i) => ({ x: PAD.left + slot * (i + 0.5), label: it.label })));
  const bars = items.map((it, i) => {
    const left = PAD.left + slot * i + (slot - width) / 2;
    if (grouped) {
      const each = (width - 2 * (it.parts.length - 1)) / it.parts.length;
      return it.parts.map((p, k) => (p.value === null ? '' : bar(left + k * (each + 2), each, y(p.value), y(0), p.cls, p.tip))).join('');
    }
    let base = 0;
    const shown = it.parts.filter((p) => (p.value ?? 0) > 0);
    return shown.map((p, k) => {
      const from = base;
      base += (p.value);
      const gap = from > 0 ? 2 : 0;
      return bar(left, width, y(base), y(from) - gap, p.cls, p.tip, k === shown.length - 1);
    }).join('');
  }).join('');
  return svg(title, markup + bars);
}

export function lineGraph(points, { min = 0, max, fmt = (v) => String(Math.round(v)), title, step = false }) {
  const values = points.map((p) => p.value).filter((v) => v !== null);
  const top = max ?? niceMax(Math.max(1, ... (values)));
  const slot = PLOT_W / Math.max(1, points.length);
  const x = ( i) => PAD.left + slot * (i + 0.5);
  const { y, markup } = frame(top, fmt, points.map((p, i) => ({ x: x(i), label: p.label })), min);
  const runs = [];
  let run = '';
  points.forEach((p, i) => {
    if (p.value === null) { if (run) runs.push(run); run = ''; return; }
    const py = y(p.value);
    run += run ? (step ? `H${r1(x(i))}V${r1(py)}` : `L${r1(x(i))} ${r1(py)}`) : `M${r1(x(i))} ${r1(py)}`;
  });
  if (run) runs.push(run);
  const lines = runs.map((d) => `<path class="graph-line" d="${d}"/>`).join('');
  const dots = points.map((p, i) => (p.value === null ? '' : `<circle class="graph-dot" cx="${r1(x(i))}" cy="${r1(y(p.value))}" r="5"><title>${esc(p.tip)}</title></circle>`)).join('');
  return svg(title, markup + lines + dots);
}

export function niceMax(n) {
  const power = 10 ** Math.floor(Math.log10(Math.max(n, 1)));
  return [1, 2, 5, 10].map((m) => m * power).find((v) => v >= n) ?? 10 * power;
}

const svg = (title, body) => `<svg xmlns="http://www.w3.org/2000/svg" class="graph" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}"><title>${esc(title)}</title>${body}</svg>`;
