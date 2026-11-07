import { h } from '../../core/dom.js';
import { REPORT_FOOTER, reportCsv, reportDates, reportSections, tutorReport } from '../../engine/tutor-report.js';
import { cornerFrame } from './gate.js';
import { downloadCsv } from './tricky.js';


export const REPORT_TITLE = 'Reading practice report';

const isoDate = (day) => new Date(day * 86400000).toISOString().slice(0, 10);

export const reportFileName = (day) => `syllable-quest-report-${isoDate(day)}.csv`;

function sectionView(s) {
  return h('section', { class: 'gu-report-section' },
    h('h3', { class: 'gu-subtitle' }, s.title),
    s.table ? h('table', { class: 'gu-table gu-report-table' },
      h('thead', {}, h('tr', {}, s.table.head.map((c) => h('th', {}, c)))),
      h('tbody', {}, s.table.rows.map((row) => h('tr', {}, row.map((c, i) => (i === 0 ? h('th', {}, c) : h('td', {}, c))))))) : null,
    (s.lines ?? []).map((line) => h('p', {}, line)),
    (s.blank ?? []).map((line) => h('p', { class: 'gu-report-blank' }, line)));
}

export function reportPage(report) {
  return h('section', { class: 'gu-printable gu-report', 'data-print': 'report' },
    h('header', { class: 'gu-report-head' },
      h('h2', { class: 'gu-report-title' }, REPORT_TITLE),
      h('p', { class: 'gu-report-dates' }, reportDates(report))),
    h('p', { class: 'gu-report-student' }, 'Student: ______________________'),
    h('div', { class: 'gu-report-columns' }, reportSections(report).map(sectionView)),
    h('footer', { class: 'gu-report-foot' }, REPORT_FOOTER.map((line) => h('p', {}, line))));
}

export function mount(el, ctx, params = {}, deps = { print: () => globalThis.print?.() }) {
  const body = cornerFrame(el, ctx, params, 'report');
  if (!body) return () => {};
  const report = tutorReport({ profile: ctx.profile, settings: ctx.settings, day: ctx.day });
  const urls = [];
  const message = h('p', { class: 'gu-message gu-screen-only', role: 'status', 'aria-live': 'polite' });
  const page = reportPage(report);
  const print = () => {
    message.textContent = '';
    const frame = page.closest?.('.grownup');
    frame?.setAttribute('data-printing', 'report');
    try {
      deps.print();
    } catch (err) {
      console.error('The tutor report could not be printed', err);
      message.textContent = "The print window couldn't open. Use the browser's own print command.";
    } finally {
      frame?.removeAttribute('data-printing');
    }
  };
  const csv = () => {
    const name = reportFileName(ctx.day);
    downloadCsv(el, urls, reportCsv(report), name);
    message.textContent = `CSV file made: ${name}. Your browser puts it in your Downloads.`;
  };
  body.append(
    h('p', { class: 'gu-hint gu-screen-only' }, 'One page for the tutor, from this device only. Print it, or save it as a PDF from the print window. It has no names on it: write one on the Student line if you like.'),
    h('div', { class: 'gu-actions gu-screen-only' },
      h('button', { type: 'button', class: 'gu-button gu-primary', 'data-action': 'print', onClick: print }, 'Print'),
      h('button', { type: 'button', class: 'gu-button', 'data-action': 'csv', onClick: csv }, 'Save as CSV')),
    message,
    page);
  return () => { for (const url of urls) URL.revokeObjectURL(url); };
}
