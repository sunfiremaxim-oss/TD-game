export function getCarrierOrbitRadius(towerRadius, bossRadius, towerRange) {
  return Math.max(towerRadius + bossRadius + 16, Math.min(towerRange * .84, 240));
}
