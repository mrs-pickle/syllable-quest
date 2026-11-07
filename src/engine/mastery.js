import { LAST_STAGE } from '../profile/settings.js';

export const GATE_KINDS = Object.freeze(['drill', 'words', 'write', 'story']);

export const STAGE_IDS = Object.freeze([
  'closed.review', 'closed.endings', 'closed.compound', 'closed.vccv-double', 'closed.vccv', 'closed.vcccv', 'closed.three',
  'open.one', 'open.vcv', 'open.y', 'open.flex',
  'vce.one', 'vce.soft', 'vce.two', 'vce.mix',
  'team.ai-ay', 'team.ee-ea', 'team.oa-igh', 'team.oo-ew', 'team.au-oi', 'team.ou-ow', 'team.mix',
  'r.ar-or', 'r.er-ir-ur', 'r.mix',
  'le.one', 'le.double', 'le.mix',
  'city.stub',
]);

export const LANDS = Object.freeze(['closed', 'open', 'vce', 'team', 'r', 'le']);

export const STALL_FAILS = 3;
export const PASS_DAYS_NEEDED = 2;
export const GATES_CAP = 2000;


const isCount = (v) => Number.isInteger(v) && (v) >= 0;

export function gatePassed(record) {
  if (record === null || typeof record !== 'object') return false;
  const { kind, right, total } = record;
  if (!isCount(right) || !isCount(total) || right > total) return false;
  switch (kind) {
    case 'drill': return total >= 6 && right * 10 >= total * 9;
    case 'words': return total >= 6 && total - right <= 1;
    case 'write': return total >= 3 && right === total;
    case 'story': {
      const { focusRight, focusTotal } = record;
      if (!isCount(focusRight) || !isCount(focusTotal) || focusRight > focusTotal) return false;
      return total >= 30 && right * 100 >= total * 95 && focusTotal >= 3 && focusRight * 10 >= focusTotal * 9;
    }
    default: return false;
  }
}

export function mergeGate(a, b) {
  const x = a ?? {};
  const y = b ?? {};
  const num = ( v) => (isCount(v) ? v : 0);
  const out = {
    day: x.day ?? y.day,
    stage: x.stage ?? y.stage,
    kind: x.kind ?? y.kind,
    right: num(x.right) + num(y.right),
    total: num(x.total) + num(y.total),
    self: num(x.self) + num(y.self),
  };
  const hasFocus = [x.focusRight, x.focusTotal, y.focusRight, y.focusTotal].some(isCount);
  if (hasFocus) {
    out.focusRight = num(x.focusRight) + num(y.focusRight);
    out.focusTotal = num(x.focusTotal) + num(y.focusTotal);
  }
  return (out);
}

export function stageStatus(gates, stageId) {
  const mine = (Array.isArray(gates) ? gates : [])
    .map((record, order) => ({ record, order }))
    .filter(({ record }) => record && record.stage === stageId)
    .sort((p, q) => (p.record.day - q.record.day) || (p.order - q.order))
    .map(({ record }) => record);
  const out = {};
  for (const kind of GATE_KINDS) {
    const attempts = mine.filter((record) => record.kind === kind);
    const days = new Set();
    let fails = 0;
    let last = false;
    for (const record of attempts) {
      last = gatePassed(record);
      if (last) { days.add(record.day); fails = 0; } else fails++;
    }
    out[kind] = { passDays: [...days].sort((p, q) => p - q), lastPassed: last, failsSincePass: fails };
  }
  const mastered = GATE_KINDS.every((kind) => out[kind].passDays.length >= PASS_DAYS_NEEDED && out[kind].lastPassed);
  return ({ ...out, mastered });
}

export const isStageMastered = (gates, stageId) => stageStatus(gates, stageId).mastered;

export function landStatus(gates, land, stageIds = STAGE_IDS) {
  const stages = stageIds
    .filter((id) => id.split('.')[0] === land)
    .map((id) => ({ id, mastered: isStageMastered(gates, id) }));
  const masteredCount = stages.filter((s) => s.mastered).length;
  return { land, stages, masteredCount, total: stages.length, mastered: stages.length > 0 && masteredCount === stages.length };
}

export function stalls(gates, stageId) {
  const status = stageStatus(gates, stageId);
  return (GATE_KINDS.filter((kind) => status[kind].failsSincePass >= STALL_FAILS));
}

export function nextStage(settings, gates, stageIds = STAGE_IDS) {
  const from = Number.isInteger(settings?.stage) ? settings.stage : 0;
  let stage = from;
  while (stage < LAST_STAGE && stageIds[stage] !== undefined && isStageMastered(gates, stageIds[stage])) stage++;
  return { stage, moved: stage !== from };
}

export function withGate(profile, record) {
  const clean = { day: record.day, stage: record.stage, kind: record.kind, right: record.right, total: record.total, self: record.self ?? 0 };
  if (record.focusRight !== undefined) clean.focusRight = record.focusRight;
  if (record.focusTotal !== undefined) clean.focusTotal = record.focusTotal;
  return { ...profile, gates: [...(profile.gates ?? []), clean].slice(-GATES_CAP) };
}

export function crestsToAward(profile, gates, stageIds = STAGE_IDS) {
  const have = new Set((profile?.crests ?? []).map((c) => c.land));
  const out = [];
  for (const land of LANDS) {
    if (have.has(land) || !landStatus(gates, land, stageIds).mastered) continue;
    const ids = new Set(stageIds.filter((id) => id.split('.')[0] === land));
    const day = Math.max(...(gates ?? []).filter((g) => ids.has(g.stage)).map((g) => g.day));
    out.push({ land, day, how: ('mastered') });
  }
  return out;
}
