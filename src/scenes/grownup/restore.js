import { h } from '../../core/dom.js';
import { createLock } from '../../core/lock.js';
import { checkBackup, importBackup } from '../../profile/backup.js';
import { readSaved } from '../../profile/saved.js';
import { cornerFrame } from './gate.js';

const MS_PER_DAY = 86400000;

const isoDate = (day) => new Date(day * MS_PER_DAY).toISOString().slice(0, 10);

export const restoreQuestion = (name) => `Restore "${name}"? It replaces every student on this device, with their progress and settings, by the ones in the file. This cannot be undone.`;

export const RESTORED_MESSAGE = 'Backup restored. The students, their progress and their settings are the ones from the file. The grown-up PIN is now the one from the backup, so use that PIN from now on.';

export const DEVICE_RESTORED = RESTORED_MESSAGE;

export const RESTORED_KEPT_PIN = 'Backup restored. The students, their progress and their settings are the ones from the file. The grown-up PIN stays the one you use now.';

export const NO_PIN_MESSAGE = "That backup was saved without the grown-up PIN, so it can't be used to start here. Answer the setup questions instead.";

export function studentLine(student, index) {
  const name = student.label.trim() !== '' ? student.label.trim() : `Student ${index + 1}`;
  const sessions = student.sessions === 0 ? 'no sessions yet'
    : `${student.sessions} ${student.sessions === 1 ? 'session' : 'sessions'}, the last on ${student.lastSessionDay === null ? 'a day not recorded' : isoDate(student.lastSessionDay)}`;
  return `${name}: stage ${student.stage}, ${sessions}`;
}

export function summaryLines(summary) {
  return [
    summary.exported ? `Made on ${summary.exported}.` : 'The day it was made is not recorded.',
    `${summary.students.length === 1 ? 'One student' : `${summary.students.length} students`} in the file:`,
    ...summary.students.map(studentLine),
    summary.hasPin ? 'It holds the grown-up PIN.' : 'It holds no grown-up PIN: the PIN you use now stays.',
  ];
}

export function restoreControls(ctx, { needsPin = false, onRestored } = {}) {
  const lock = createLock();
  const message = h('p', { class: 'gu-message', role: 'status', 'aria-live': 'polite' });
  const confirmBox = h('div', { class: 'gu-confirm gu-restore-confirm', hidden: true });
  let picked = null;

  const input = (h('input', { type: 'file', class: 'gu-file', hidden: true, accept: '.json,application/json',
    onChange: () => { pick(input.files?.[0] ?? null).catch((err) => console.error('The backup file could not be checked', err)); } }));

  const pick = (file) => lock.run(async () => {
    input.value = '';
    picked = null;
    confirmBox.hidden = true;
    message.textContent = '';
    if (!file) return;
    let text;
    try {
      text = await file.text();
    } catch (err) {
      console.error('The backup file could not be read', err);
      message.textContent = "That file couldn't be read, so nothing was changed.";
      return;
    }
    const checked = checkBackup(text);
    if (!checked.ok) { message.textContent = checked.error; return; }
    if (needsPin && !checked.summary.hasPin) { message.textContent = NO_PIN_MESSAGE; return; }
    picked = { name: file.name, text, hasPin: checked.summary.hasPin };
    confirmBox.replaceChildren(
      h('ul', { class: 'gu-summary' }, summaryLines(checked.summary).map((line) => h('li', {}, line))),
      h('p', {}, h('strong', {}, restoreQuestion(file.name))),
      h('div', { class: 'gu-row' },
        h('button', { type: 'button', class: 'gu-button gu-primary', 'data-restore': 'confirm', onClick: () => { restore(); } }, 'Restore and replace'),
        h('button', { type: 'button', class: 'gu-button', 'data-restore': 'cancel', onClick: () => { picked = null; confirmBox.hidden = true; } }, 'Cancel')));
    confirmBox.hidden = false;
    confirmBox.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  });

  const restore = () => lock.run(async () => {
    const file = picked;
    picked = null;
    confirmBox.hidden = true;
    if (!file) return;
    const result = await importBackup(ctx.store, file.text);
    if (!result.ok) { message.textContent = result.error; return; }
    await ctx.store.reload?.();
    const saved = await readSaved(ctx.store);
    ctx.settings = saved.settings;
    ctx.profile = saved.profile;
    ctx.states = saved.states;
    ctx.today = saved.today;
    await ctx.audio?.reloadOverrides?.();
    await ctx.save();
    message.textContent = file.hasPin ? RESTORED_MESSAGE : RESTORED_KEPT_PIN;
    onRestored?.();
  }).catch((err) => {
    console.error('The backup could not be restored', err);
    message.textContent = "The backup couldn't be restored in this browser window.";
  });

  const choose = h('button', { type: 'button', class: 'gu-button', onClick: () => input.click() }, 'Choose a backup file');
  return { nodes: [choose, input, confirmBox, message], message };
}

export function mount(el, ctx, params = {}) {
  const body = cornerFrame(el, ctx, params, 'restore');
  if (!body) return () => {};
  const restoring = restoreControls(ctx);
  body.append(
    h('p', {}, 'Bring back a backup file saved from this game, here or on another computer.'),
    h('section', { class: 'gu-setting', 'data-setting': 'restore' },
      h('h2', { class: 'gu-setting-label' }, 'Restore from a backup file'),
      h('p', { class: 'gu-help' }, 'The file is checked first, and a file that is not a good backup changes nothing. You see who and what is in it before anything is replaced. A restore replaces every student on this device with the ones in the file.'),
      ...restoring.nodes));
  return () => {};
}
