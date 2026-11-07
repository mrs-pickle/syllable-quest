import { h } from '../../core/dom.js';
import { createLock } from '../../core/lock.js';
import { exportBackup } from '../../profile/backup.js';
import { PRE_STUDENTS_BACKUP_KEY } from '../../profile/migrate.js';
import { cornerFrame } from './gate.js';
import { removeStudentSection } from './remove-student.js';

const MS_PER_DAY = 86400000;

const isoDate = (day) => new Date(day * MS_PER_DAY).toISOString().slice(0, 10);

export const backupFileName = (day) => `syllable-quest-backup-${isoDate(day)}.json`;

export const PRE_STUDENTS_FILE_NAME = 'syllable-quest-backup-before-students.json';

export function downloadText(el, urls, text, name) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  urls.push(url);
  const link = h('a', { href: url, download: name, hidden: true });
  el.append(link);
  link.click();
  link.remove();
}

export async function saveBackupFile(el, ctx, urls, { includePin = false } = {}) {
  await ctx.save();
  const text = await exportBackup(ctx.store, { includePin, now: new Date(ctx.day * MS_PER_DAY) });
  const file = backupFileName(ctx.day);
  downloadText(el, urls, text, file);
  return file;
}

export function mount(el, ctx, params = {}) {
  const body = cornerFrame(el, ctx, params, 'backup');
  if (!body) return () => {};
  const lock = createLock();
  const urls = [];
  const base = ctx.store.base ?? null;
  const students = typeof ctx.store.students === 'function' ? ctx.store.students() : [];

  const message = h('p', { class: 'gu-message', role: 'status', 'aria-live': 'polite' });
  const includePin = (h('input', { type: 'checkbox', id: 'gu-backup-pin', class: 'gu-check' }));
  const save = () => lock.run(async () => {
    let file;
    try {
      file = await saveBackupFile(el, ctx, urls, { includePin: includePin.checked === true });
    } catch (err) {
      console.error('The backup could not be made', err);
      message.textContent = `The backup couldn't be made: ${err instanceof Error ? err.message : err}`;
      return;
    }
    message.textContent = `Backup file made: ${file}. Your browser puts it in your Downloads. Keep it somewhere safe; it holds ${students.length > 1 ? 'every student on this device' : 'the progress'}.`;
  });

  const removing = base && students.length > 1 ? removeStudentSection(ctx, {
    backup: async () => saveBackupFile(el, ctx, urls, { includePin: false }),
  }) : null;

  const older = h('section', { class: 'gu-setting', 'data-setting': 'pre-students', hidden: true });
  if (base) {
    base.get(PRE_STUDENTS_BACKUP_KEY).then(( text) => {
      if (typeof text !== 'string') return;
      const olderMessage = h('p', { class: 'gu-message', role: 'status', 'aria-live': 'polite' });
      older.append(
        h('h2', { class: 'gu-setting-label' }, 'The backup made before students'),
        h('p', { class: 'gu-help' }, 'When this version first opened, it kept a copy of the progress as it was, before a second student could be added. Nothing was lost; this copy is only in case. Save it as a file to keep it.'),
        h('button', { type: 'button', class: 'gu-button', onClick: () => {
          lock.run(async () => {
            downloadText(el, urls, text, PRE_STUDENTS_FILE_NAME);
            olderMessage.textContent = `Backup file made: ${PRE_STUDENTS_FILE_NAME}.`;
          }).catch((err) => console.error(err));
        } }, 'Save the backup made before students'),
        olderMessage);
      older.hidden = false;
    }).catch(( err) => console.error('The backup made before students could not be read', err));
  }

  body.append(...[
    h('p', {}, 'The progress lives only in this browser on this computer. Save a backup now and then, and before moving to another computer: restore it there from the Restore screen.'),
    h('section', { class: 'gu-setting', 'data-setting': 'backup' },
      h('h2', { class: 'gu-setting-label' }, 'Save a backup file'),
      h('p', { class: 'gu-help' }, 'One .json file with every student on this device: their settings, progress and the words practised, and your voice recordings (the Recordings screen). It is made here in the page and saved by your browser; nothing is sent anywhere.'),
      h('div', { class: 'gu-row' },
        includePin,
        h('label', { for: 'gu-backup-pin' }, 'Include the grown-up PIN in the file')),
      h('p', { class: 'gu-hint' }, 'Leave this off if the file will be shared. Without it, a restore keeps the PIN of the computer it is restored on.'),
      h('button', { type: 'button', class: 'gu-button gu-primary', onClick: () => { save().catch((err) => console.error(err)); } }, 'Save a backup file'),
      message),
    older,
    removing].filter((node) => node !== null));
  return () => { for (const url of urls) URL.revokeObjectURL(url); };
}
