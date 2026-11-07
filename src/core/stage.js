export const STAGE_WIDTH = 1280;
export const STAGE_HEIGHT = 800;

export const TINTS = Object.freeze(['paper', 'cream', 'blue', 'green', 'rose', 'lilac']);

export function fitScale(width, height) {
  const scale = Math.min(width / STAGE_WIDTH, height / STAGE_HEIGHT);
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

export function mountStage(root) {
  const doc = root.ownerDocument;
  const el = doc.createElement('div');
  el.className = 'stage';
  root.classList.add('viewport');
  root.replaceChildren(el);

  let scale = 1;
  const fit = () => {
    scale = fitScale(root.clientWidth, root.clientHeight);
    el.style.transform = `translate(-50%, -50%) scale(${scale})`;
  };
  fit();
  const view = doc.defaultView;
  if (view?.ResizeObserver) new view.ResizeObserver(fit).observe(root);
  else view?.addEventListener('resize', fit);
  return { el, scale: () => scale };
}

export function applyComfort(el, { spacing, tint } = {}) {
  el.setAttribute('data-spacing', spacing === 'wide' ? 'wide' : 'normal');
  el.setAttribute('data-tint', TINTS.includes( (tint)) ? (tint) : 'paper');
}
