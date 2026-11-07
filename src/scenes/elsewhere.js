import { h } from '../core/dom.js';
import { createLock } from '../core/lock.js';
import { artUrl, bigButton } from '../ui/components.js';

export function mount(el, ctx) {
  const lock = createLock();
  const button = bigButton({ label: 'Play here instead', icon: 'ui/paw', onClick: () => {
    lock.run(async () => {
      ctx.audio.stop();
      button.disabled = true;
      await ctx.playHere();
    }).catch((err) => {
      button.disabled = false;
      console.error('The game could not move to this window', err);
    });
  } });
  el.append(h('div', { class: 'elsewhere' },
    h('img', { class: 'scene-bg', src: artUrl('bg/map'), alt: '' }),
    h('div', { class: 'elsewhere-card', role: 'alert' },
      h('p', { class: 'elsewhere-text' }, "Meadowlark's World: Syllable Quest is open in another window."),
      button)));
  ctx.setReplay(['v.window.elsewhere']);
  return () => {};
}
