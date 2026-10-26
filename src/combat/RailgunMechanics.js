export function getRailgunOrbitRadius(towerRadius, bossRadius, attackRange) {
  return Math.max(towerRadius + bossRadius + 12, Math.min(230, attackRange * .88));
}
