import { readSaved } from './saved.js';

export async function switchStudent(game, change) {
  if (game.dayEnding) await game.dayEnding;
  if (game.store.registered()) await game.save();
  change();
  Object.assign(game, await readSaved(game.store), { setupDraft: null });
  await game.audio.reloadOverrides();
}
