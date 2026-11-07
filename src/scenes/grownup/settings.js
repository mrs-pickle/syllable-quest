import { h } from '../../core/dom.js';
import { TINTS } from '../../core/stage.js';
import { STAGES } from '../../curriculum/stages.js';
import { withPointer } from '../../profile/profile.js';
import { BREAK_STYLES, LAST_STAGE, MIX_IT_UP, normalizeSettings } from '../../profile/settings.js';
import { checkPin, cornerFrame, hashPin, isValidPin, routeFor } from './gate.js';
import { startOverSection } from './start-over.js';


export const SETTING_HELP = Object.freeze({
  stage: { label: 'Current stage',
    help: 'The stage a session teaches from. Everything your reader reads uses only patterns up to this stage. Moving it back hides later words from sessions; the history is kept.' },
  placement: { label: 'Placement check',
    help: 'About 8 minutes with you scoring. Take it again at any time: a retake only measures, and moves nothing unless you choose to use the result.' },
  sessionMinutes: { label: 'Session length',
    help: 'About how long a session lasts. A session can end at any time and picks up where it stopped.' },
  copilot: { label: 'A grown-up sits beside your reader',
    help: 'On: you judge the answers said aloud. Off: those moments become self-checks and are not scored.' },
  terms: { label: 'Names for the syllable types',
    help: 'Story names (Bossy R, Silent E, Little Tail) or classroom names (r-controlled, vowel-consonant-e, consonant-le).' },
  placeholderVoice: { label: 'Placeholder voice',
    help: "Until recordings exist, the browser's own voice reads the lines it can. Made-up words and single sounds are never read by it: you say those." },
  voiceRate: { label: 'Placeholder voice speed', help: 'How fast the placeholder voice speaks.' },
  tint: { label: 'Background tint', help: 'A comfort option for reading. Letters keep their off-white backing.' },
  spacing: { label: 'Text spacing', help: 'Wide spreads the letters and words a little further apart.' },
  pickSounds: { label: "Say each letter's sound when picked",
    help: 'When your reader taps a letter tile, it says the sound it makes in that word (the a of cake says its long sound). Sounds without a recording are never guessed: the letter name is said instead.' },
  paperBackup: { label: 'Paper tile backups', help: 'Shows a printable paper-tile version of on-screen tiles.' },
  writeOnScreen: { label: 'Where your reader writes',
    help: 'On the screen: a writing pad on the Word Book, sound and Trickster screens, with an eraser. Her writing is never saved and the game never marks it; you look at it and mark the spelling. Or in the paper Word Book, as before. A small "Use paper today" on those screens switches for the day.' },
  doseOverride: { label: 'Long-word practice per session', help: 'Automatic follows how secure your reader is with splitting words. Or choose a fixed number of words.' },
  breakStyle: { label: 'Movement break',
    help: 'Mix it up takes all five in turn, none repeated until every one has played, across lessons too. Or choose one to play every time. You can always skip a break.' },
  muted: { label: 'Sound', help: 'Off silences the game on this device.' },
  tipsSeen: { label: 'Grown-up tips', help: 'Each tip shows once, the first time it is needed.' },
  pin: { label: 'Grown-up PIN', help: 'Four to eight digits. It keeps the grown-up corner for grown-ups.' },
});

export const GROWN_UP_WHY = 'grown-up';

export const stageLabel = (n) => `Stage ${n}: ${STAGES[n]?.name ?? ''}`.replace(/: $/, '');

const capitalized = (id) => id.charAt(0).toUpperCase() + id.slice(1);

const CHOICES = Object.freeze({
  sessionMinutes: [[15, '15 minutes'], [20, '20 minutes'], [25, '25 minutes']],
  copilot: [[true, 'On'], [false, 'Off']],
  terms: [['story', 'Story names'], ['classroom', 'Classroom names']],
  placeholderVoice: [[true, 'On'], [false, 'Off']],
  voiceRate: [[0.75, 'Slower'], [0.9, 'Normal'], [1.1, 'Faster']],
  tint: TINTS.map((tint) => [tint, capitalized(tint)]),
  spacing: [['normal', 'Normal'], ['wide', 'Wide']],
  pickSounds: [[true, 'On'], [false, 'Off']],
  paperBackup: [[true, 'On'], [false, 'Off']],
  writeOnScreen: [[true, 'Write on screen'], [false, 'Write in the paper Word Book']],
  doseOverride: [[null, 'Automatic'], [3, '3 words'], [6, '6 words']],
  muted: [[false, 'On'], [true, 'Off']],
  breakStyle: [[MIX_IT_UP, 'Mix it up'], ...BREAK_STYLES.map((style) => [style, capitalized(style)])],
});

export function updateSetting(settings, key, value) {
  if (key === 'tint' || key === 'spacing') return normalizeSettings({ ...settings, comfort: { ...settings.comfort, [key]: value } });
  return normalizeSettings({ ...settings, [key]: value });
}

export async function checkPinChange({ current, next, again, hash, viaHold }) {
  if (!viaHold && !(await checkPin(current, hash))) return "The current PIN doesn't match.";
  if (!isValidPin(next)) return 'Choose a new PIN of 4 to 8 digits.';
  if (next !== again) return "The two new PINs don't match.";
  return null;
}

export function mount(el, ctx, params = {}) {
  const body = cornerFrame(el, ctx, params, 'settings');
  if (!body) return () => {};

  const status = h('p', { class: 'gu-saved', role: 'status', 'aria-live': 'polite' });
  const say = (text) => { status.textContent = text; };
  const save = async () => {
    try {
      await ctx.save();
      say('Saved.');
    } catch (err) {
      console.error('Settings could not be saved', err);
      say("Saving didn't work in this browser window.");
    }
  };
  const change = (key, value) => {
    ctx.settings = updateSetting(ctx.settings, key, value);
    save();
  };
  const current = (key) => (key === 'tint' ? ctx.settings.comfort.tint : key === 'spacing' ? ctx.settings.comfort.spacing : ctx.settings[key]);

  const row = (key, ...control) => h('section', { class: 'gu-setting', 'data-setting': key },
    h('h2', { class: 'gu-setting-label' }, SETTING_HELP[key].label),
    h('p', { class: 'gu-help' }, SETTING_HELP[key].help),
    ...control);

  const segmented = (key) => {
    const group = h('div', { class: 'gu-segmented', role: 'group', 'aria-label': SETTING_HELP[key].label });
    const draw = () => group.replaceChildren(...CHOICES[key].map(([value, label]) => h('button', {
      type: 'button', class: 'gu-choice', 'aria-pressed': String(current(key) === value),
      onClick: () => { change(key, value); draw(); },
    }, label)));
    draw();
    return group;
  };

  const stageMessage = h('p', { class: 'gu-message', role: 'status', 'aria-live': 'polite' });
  const stageAsk = h('div', { class: 'gu-confirm gu-stage-confirm', hidden: true });
  const stage = (h('select', { class: 'gu-select', 'aria-label': SETTING_HELP.stage.label,
    onChange: () => { askStage(Number(stage.value)); } },
  Array.from({ length: LAST_STAGE + 1 }, (_, n) => h('option', { value: String(n), selected: n === ctx.settings.stage }, stageLabel(n)))));
  const askStage = (next) => {
    if (next === ctx.settings.stage) { stageAsk.hidden = true; return; }
    const keep = h('button', { type: 'button', class: 'gu-button', onClick: () => {
      stage.value = String(ctx.settings.stage);
      stageAsk.hidden = true;
    } }, `Keep ${stageLabel(ctx.settings.stage)}`);
    stageAsk.replaceChildren(
      h('p', {}, `Move the current stage to ${stageLabel(next)}? Sessions will teach from there. The change is noted in the stage history.`),
      h('div', { class: 'gu-row' },
        h('button', { type: 'button', class: 'gu-button gu-primary', 'data-stage-confirm': String(next), onClick: () => {
          stageAsk.hidden = true;
          ctx.settings = updateSetting(ctx.settings, 'stage', next);
          ctx.profile = withPointer(ctx.profile, ctx.day, ctx.settings.stage, GROWN_UP_WHY);
          stage.value = String(ctx.settings.stage);
          stageMessage.textContent = `The current stage is ${stageLabel(ctx.settings.stage)}.`;
          save();
        } }, `Move to ${stageLabel(next)}`),
        keep));
    stageAsk.hidden = false;
    keep.focus();
  };

  const viaHold = ctx.cornerEntry === 'hold';
  const pinMessage = h('p', { class: 'gu-message', role: 'status', 'aria-live': 'polite' });
  const pinField = (label, id) => h('div', { class: 'gu-field' }, h('label', { class: 'gu-label', for: id }, label),
    h('input', { class: 'gu-input', id, type: 'password', inputmode: 'numeric', maxlength: '8', autocomplete: 'off' }));
  const pinForm = h('form', { class: 'gu-pin-form', onSubmit: async ( event) => {
    event.preventDefault();
    const value = ( id) => (pinForm.querySelector(`[id="${id}"]`))?.value ?? '';
    const problem = await checkPinChange({ current: value('gu-pin-old'), next: value('gu-pin-new'), again: value('gu-pin-new2'), hash: ctx.settings.pin, viaHold });
    if (problem) { pinMessage.textContent = problem; return; }
    ctx.settings = updateSetting(ctx.settings, 'pin', await hashPin(value('gu-pin-new')));
    for (const input of pinForm.querySelectorAll('input')) (input).value = '';
    pinMessage.textContent = 'The PIN is changed.';
    save();
  } },
  viaHold && h('p', { class: 'gu-hint' }, "You opened the corner with the hold button, so the current PIN isn't asked for. Choose a new one."),
  h('div', { class: 'gu-row gu-wrap' }, ...(viaHold ? [] : [pinField('Current PIN', 'gu-pin-old')]), pinField('New PIN', 'gu-pin-new'), pinField('New PIN again', 'gu-pin-new2')),
  h('button', { type: 'submit', class: 'gu-button' }, 'Change PIN'),
  pinMessage);

  const tipsMessage = h('p', { class: 'gu-message', role: 'status', 'aria-live': 'polite' });
  const tipsAgain = h('button', { type: 'button', class: 'gu-button', onClick: () => {
    change('tipsSeen', {});
    tipsMessage.textContent = 'The grown-up tips will show again, each the next time it is needed.';
  } }, 'Show grown-up tips again');

  body.append(
    status,
    row('stage', stage, stageAsk, stageMessage),
    row('placement', h('button', { type: 'button', class: 'gu-button', 'data-open': 'placement', onClick: () => {
      ctx.router.go(...routeFor('placement')).catch(( err) => console.error('The placement check could not open', err));
    } }, 'Open the placement check')),
    row('sessionMinutes', segmented('sessionMinutes')),
    row('copilot', segmented('copilot')),
    row('terms', segmented('terms')),
    row('placeholderVoice', segmented('placeholderVoice')),
    row('voiceRate', segmented('voiceRate')),
    row('tint', segmented('tint')),
    row('spacing', segmented('spacing')),
    row('pickSounds', segmented('pickSounds')),
    row('paperBackup', segmented('paperBackup')),
    row('writeOnScreen', segmented('writeOnScreen')),
    row('doseOverride', segmented('doseOverride')),
    row('breakStyle', segmented('breakStyle')),
    row('muted', segmented('muted')),
    row('tipsSeen', tipsAgain, tipsMessage),
    row('pin', pinForm),
    startOverSection(ctx));
  return () => {};
}
