import { newProfile } from './profile.js';



export const PROFILE_FATES = Object.freeze({
  version: 'keep',
  createdDay: 'keep',
  placements: 'reset',
  pointerLog: 'keep',
  sessions: 'reset',
  gates: 'reset',
  errors: 'reset',
  passes: 'reset',
  crests: 'reset',
  landmarks: 'reset',
  pages: 'reset',
  passageLog: 'reset',
  divisionMs: 'reset',
  discoverySeen: 'reset',
  storySeen: 'reset',
  sweep: 'reset',
});

export function startedOverProfile(profile) {
  const fresh = (newProfile(profile.createdDay));
  const next = ({ ...profile });
  for (const [field, fate] of Object.entries(PROFILE_FATES)) {
    if (fate !== 'reset') continue;
    if (Object.hasOwn(fresh, field)) next[field] = fresh[field];
    else delete next[field];
  }
  return (next);
}

export const startedOverSettings = (settings) => ({ ...settings, tipsSeen: {} });


export async function startOver(ctx) {
  const { settings, profile, states, today } = ctx;
  Object.assign(ctx, { settings: startedOverSettings(settings), profile: startedOverProfile(profile), states: new Map(), today: null });
  let saved = false;
  try {
    saved = (await ctx.save()) !== false;
  } finally {
    if (!saved) Object.assign(ctx, { settings, profile, states, today });
  }
  return saved;
}
