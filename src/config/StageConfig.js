// Campaign stages share local wave numbers; only the last wave contains a boss.
export const STAGE_ENEMIES = ['scout', 'fighter', 'tank', 'sniper', 'aegis', 'splitter', 'blinker'];
export const STAGES = Array.from({ length: 8 }, (_, index) => ({
  id: index + 1,
  waves: index === 0 ? 10 : 20,
  boss: index === 0 ? 'boss_scout' : index === 1 ? 'boss_carrier' : index === 3 ? 'boss_railgun' : index === 4 ? 'boss_citadel' : index === 5 ? 'boss_fractal' : 'boss_architect',
  firstHalf: STAGE_ENEMIES.slice(0, Math.max(1, index)),
  secondHalf: STAGE_ENEMIES.slice(0, Math.min(STAGE_ENEMIES.length, index + 1)),
  hpMultiplier: Math.pow(1.25, index),
  damageMultiplier: Math.pow(1.15, index),
  rewardMultiplier: Math.pow(1.10, index)
}));

export function getStage(id) {
  return Number.isInteger(id) && id >= 1 && id <= STAGES.length ? STAGES[id - 1] : null;
}
