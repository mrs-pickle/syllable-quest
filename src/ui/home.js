import { h } from '../core/dom.js';
import { createLock } from '../core/lock.js';
import { artUrl } from './components.js';

const NO_HOME = Object.freeze(new Set(['map', 'elsewhere', 'start']));

export const showsHome = (scene) => !NO_HOME.has(scene);

export const homeParams = (_scene) => ({ home: true });


export function createHome({ audio, open }) {
  const lock = createLock();
  let asking = null;
  const leave = () => {
    lock.run(() => {
      audio.stop();
      return open();
    }).catch((err) => console.error('The map could not open', err));
  };
  const button = h('button', { type: 'button', class: 'home-button', 'aria-label': 'Back to the map', hidden: true,
    onClick: ( event) => {
      if (event.detail >= 2) return;
      if (asking) asking(leave);
      else leave();
    } }, h('img', { src: artUrl('ui/home'), alt: '', draggable: 'false' }));
  return {
    button,
    arrived(scene) {
      button.hidden = !showsHome(scene);
      asking = null;
    },
    ask(fn) {
      asking = fn;
      return () => { if (asking === fn) asking = null; };
    },
  };
}
