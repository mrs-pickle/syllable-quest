import { h } from '../../core/dom.js';
import { createArrivalGuard, createLock } from '../../core/lock.js';
import { removeStudent } from '../../profile/students.js';
import { switchStudent } from '../../profile/switch-student.js';
import { saveBackupFile } from './backup.js';
import { cornerFrame } from './gate.js';

export const removeWarning = (name) => `This erases ${name}'s progress, the settings made for this student and the recordings of this student's names from this device. It cannot be undone. Save a backup file first: it holds this student's progress too.`;

export function removeStudentSection(ctx, { backup }) {
  const lock = createLock();
  let arrival = createArrivalGuard();
  const message = h('p', { class: 'gu-message', role: 'status', 'aria-live': 'polite' });
  const choices = h('div', { class: 'gu-row' });
  const box = h('div', { class: 'gu-confirm gu-remove-student', hidden: true });
  const section = h('section', { class: 'gu-setting', 'data-setting': 'remove-student' },
    h('h2', { class: 'gu-setting-label' }, 'Remove a student'),
    h('p', { class: 'gu-help' }, 'Two students is the most on one device. To make room for a new one, remove a student here. Nothing is removed until you say yes twice.'),
    choices, box, message);

  const open = (focus, ...nodes) => {
    box.replaceChildren(...nodes);
    box.hidden = false;
    choices.hidden = true;
    arrival = createArrivalGuard();
    focus.focus();
    box.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  };
  const close = () => { box.hidden = true; choices.hidden = false; };

  const warn = (id, name) => {
    const keep = h('button', { type: 'button', class: 'gu-button', onClick: close }, `Keep ${name}`);
    open(keep,
      h('p', {}, h('strong', {}, removeWarning(name))),
      h('div', { class: 'gu-row' },
        h('button', { type: 'button', class: 'gu-button gu-primary', onClick: () => {
          lock.run(async () => { message.textContent = `Backup file made: ${await backup(id)}. Your browser puts it in your Downloads.`; })
            .catch((err) => { console.error('The backup could not be made', err); message.textContent = "The backup couldn't be made."; });
        } }, `Save ${name}'s backup file first`),
        keep),
      h('div', { class: 'gu-start-over-yes' },
        h('button', { type: 'button', class: 'gu-button', onClick: ( event) => { if (arrival.allows(event)) ask(id, name); } }, `Remove ${name}…`)));
  };

  const ask = (id, name) => {
    const keep = h('button', { type: 'button', class: 'gu-button', onClick: close }, `Keep ${name}`);
    open(keep,
      h('p', {}, h('strong', {}, `Are you sure? ${name} will be gone from this device.`)),
      h('div', { class: 'gu-row' }, keep),
      h('div', { class: 'gu-start-over-yes' },
        h('button', { type: 'button', class: 'gu-button gu-danger', onClick: ( event) => {
          if (arrival.allows(event)) remove(id, name);
        } }, `Yes, remove ${name}`)));
  };

  const remove = (id, name) => lock.run(async () => {
    box.hidden = true;
    const other = ctx.store.students().find(( s) => s.id !== id);
    if (!other) return;
    if (ctx.store.student === id) await switchStudent(ctx, () => ctx.store.use(other.id));
    await removeStudent(ctx.store.base, id);
    await ctx.store.reload();
    choices.replaceChildren();
    message.textContent = `${name} was removed from this device. New Student is on the start menu again.`;
  }).catch((err) => {
    console.error('The student could not be removed', err);
    message.textContent = "Removing didn't work in this browser window.";
  });

  Promise.all(ctx.store.students().map(async ( { id, label }, i) => {
    const name = typeof label === 'string' && label.trim() !== '' ? label.trim() : `Student ${i + 1}`;
    return h('button', { type: 'button', class: 'gu-button', 'data-student': id, onClick: () => { if (!lock.locked()) warn(id, name); } }, `Remove ${name}…`);
  })).then((buttons) => { choices.replaceChildren(...buttons); })
    .catch((err) => console.error('The students could not be read', err));
  return section;
}

export function mount(el, ctx, params = {}) {
  const body = cornerFrame(el, ctx, params, 'remove-student');
  if (!body) return () => {};
  const urls = [];
  const students = typeof ctx.store?.students === 'function' ? ctx.store.students() : [];
  if (!ctx.store?.base || students.length < 2) {
    body.append(h('p', { class: 'gu-empty', 'data-setting': 'remove-student' },
      'There is only one student on this device, and the last student is never removed. To begin again, use Start over in Settings.'));
    return () => {};
  }
  body.append(removeStudentSection(ctx, { backup: async () => saveBackupFile(el, ctx, urls) }));
  return () => { for (const url of urls) URL.revokeObjectURL(url); };
}
