import { CitadelComponent, CitadelGeneratorComponent } from '../components/CitadelComponent.js';
import { HealthComponent } from '../components/HealthComponent.js';
import { GameConfig } from '../config/GameConfig.js';

export function isCitadelGeneratorAlive(world, attachment) {
  return attachment != null && attachment.health.current > 0 &&
    !world.destructionQueue.has(attachment.id) &&
    world.getComponent(attachment.id, HealthComponent) === attachment.health;
}

export function isCitadelProtected(world, id) {
  const citadel = world.getComponent(id, CitadelComponent);
  return !!citadel && !citadel.hullExposed && citadel.generators.some(part => isCitadelGeneratorAlive(world, part));
}

export function getCitadelGeneratorMask(world, citadel) {
  let mask = 0;
  for (let slot = 0; slot < 6; slot++) {
    if (isCitadelGeneratorAlive(world,citadel.generators[slot])) mask |= 1 << slot;
  }
  return mask;
}

export function isCombatTargetAvailable(world, id) {
  if (isCitadelProtected(world, id)) return false;
  const generator = world.getComponent(id, CitadelGeneratorComponent);
  return !generator || (world.getComponent(generator.ownerId, HealthComponent) === generator.ownerHealth &&
    generator.ownerHealth.current > 0 && !world.destructionQueue.has(generator.ownerId));
}

export function getCitadelStopRadius(towerRadius, towerRange, protectedHull) {
  const cfg = GameConfig.enemies.boss_citadel;
  // Leave space for the near-side generator even at the starting attack range.
  return protectedHull
    ? Math.max(towerRadius + cfg.generatorOrbit + GameConfig.enemies.citadel_generator.radius + 8, towerRange * .9)
    : Math.max(towerRadius + cfg.radius + 12, towerRange * .88);
}
