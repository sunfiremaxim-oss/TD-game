export function getRailgunOrbitRadius(towerRadius, bossRadius, attackRange) {
  // A tiny inset keeps the center in range despite floating-point arc updates.
  return Math.max(towerRadius + bossRadius + 12, attackRange - 2);
}

export function getRailgunShieldHealth(rail) {
  return rail?.phase === 'reposition' && Number.isFinite(rail.shieldHp) ? Math.max(0,rail.shieldHp) : 0;
}
