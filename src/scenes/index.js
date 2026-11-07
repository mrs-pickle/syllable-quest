export const SCENES = Object.freeze({
  start: () => import('./start.js'),
  map: () => import('./map.js'),
  land: () => import('./land.js'),
  session: () => import('./session.js'),
  greatbook: () => import('./greatbook.js'),
  placement: () => import('./placement.js'),
  activity: () => import('./activity.js'),
  break: () => import('./break.js'),
  elsewhere: () => import('./elsewhere.js'),
  'grownup/gate': () => import('./grownup/gate.js'),
  'grownup/today': () => import('./grownup/today.js'),
  'grownup/progress': () => import('./grownup/progress.js'),
  'grownup/tricky': () => import('./grownup/tricky.js'),
  'grownup/settings': () => import('./grownup/settings.js'),
  'grownup/passes': () => import('./grownup/passes.js'),
  'grownup/recordings': () => import('./grownup/recordings.js'),
  'grownup/backup': () => import('./grownup/backup.js'),
  'grownup/restore': () => import('./grownup/restore.js'),
  'grownup/start-over': () => import('./grownup/start-over.js'),
  'grownup/remove-student': () => import('./grownup/remove-student.js'),
  'grownup/about': () => import('./grownup/about.js'),
  'grownup/printables': () => import('./grownup/printables.js'),
  'grownup/tips': () => import('./grownup/tips.js'),
});

export function loadScene(name) {
  if (!Object.hasOwn(SCENES, name)) return Promise.reject(new RangeError(`No scene "${name}"`));
  return SCENES[name]();
}
