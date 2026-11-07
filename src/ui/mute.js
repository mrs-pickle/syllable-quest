import { h } from '../core/dom.js';
import { artUrl } from './components.js';

export const showsMute = (scene) => scene !== 'elsewhere' && !scene.startsWith('grownup/');


export function createMute({ audio, game }) {
  const picture = (h('img', { alt: '', draggable: 'false' }));
  const muted = () => game()?.settings?.muted === true;
  const draw = () => {
    const on = muted();
    button.setAttribute('aria-pressed', String(on));
    picture.setAttribute('src', artUrl(on ? 'ui/sound-off' : 'ui/sound-on'));
  };
  const set = (on) => {
    const ctx = game();
    if (!ctx) return;
    ctx.settings = { ...ctx.settings, muted: on };
    draw();
    if (on) audio.stop();
    const registered = ctx.store?.registered?.() ?? true;
    if (registered) Promise.resolve(ctx.save()).catch((err) => console.error('The sound setting could not be saved', err));
  };
  const button = h('button', { type: 'button', class: 'mute-button', 'aria-label': 'Sound off', hidden: true,
    onClick: () => set(!muted()) }, picture);
  draw();
  return {
    button,
    muted,
    set,
    replay(play) {
      if (muted()) set(false);
      play();
    },
    arrived(scene) {
      button.hidden = !showsMute(scene);
      draw();
    },
  };
}
