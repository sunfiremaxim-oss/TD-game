import { ArmorComponent } from '../components/ArmorComponent.js';
import { TransformComponent } from '../components/TransformComponent.js';
import { TowerComponent } from '../components/TowerComponent.js';
import { EnemyComponent } from '../components/EnemyComponent.js';
import { ProjectileComponent } from '../components/ProjectileComponent.js';
import { CarrierComponent } from '../components/CarrierComponent.js';
import { ArchitectSiegeComponent } from '../components/ArchitectSiegeComponent.js';
import { RailgunComponent } from '../components/RailgunComponent.js';
import { GameConfig } from '../config/GameConfig.js';

// Shared mitigation for real hits and targeting predictions. Does not mutate the world.
export function calculateMitigatedDamage(world, targetId, rawDamage) {
  const armor = world.getComponent(targetId, ArmorComponent);

  // Tower upgrades are uncapped; mitigation cannot turn incoming damage into healing.
  const flatRed = armor ? (armor.flatReduction || 0) : 0;
  const rawPct = armor ? (armor.percentReduction || 0) : 0;
  const cappedPct = Math.max(0, Math.min(world.hasComponent(targetId, TowerComponent) ? 1 : 0.85, rawPct));

  const damageAfterFlat = Math.max(1, rawDamage - flatRed);
  let netDamage = Math.max(1, Math.round(damageAfterFlat * (1 - cappedPct)));
  const carrier = world.getComponent(targetId, CarrierComponent);
  if (carrier) {
    const cfg = GameConfig.enemies.boss_carrier;
    netDamage = Math.max(1, Math.round(netDamage * (carrier.phase === 'exposed' ? cfg.exposedDamageMultiplier : cfg.closedDamageMultiplier)));
  }
  const rail = world.getComponent(targetId,RailgunComponent);
  if (rail?.phase === 'cooldown') netDamage = Math.max(1,Math.round(netDamage * GameConfig.enemies.boss_railgun.coolingDamageMultiplier));
  const siege = world.getComponent(targetId, ArchitectSiegeComponent);
  if (siege) {
    const cfg = GameConfig.enemies.boss_architect;
    const multiplier = siege.phase === 'overheated' ? cfg.overheatedDamageMultiplier
      : siege.phase === 'approach' || siege.phase === 'windup' ? cfg.approachDamageMultiplier : 1;
    netDamage = Math.max(1, Math.round(netDamage * multiplier));
  }

  // Aegis Dome Defense: 50% damage reduction for all enemies inside an active Aegis dome
  if (!world.hasComponent(targetId, TowerComponent)) {
    const aegises = world.getEntitiesWith(EnemyComponent, TransformComponent);
    const targetTrans = world.getComponent(targetId, TransformComponent);
    if (targetTrans) {
      let insideAegisDome = false;
      for (const aId of aegises) {
        if (aId === targetId) continue; // Aegis only protects allies around it, not itself
        const aComp = world.getComponent(aId, EnemyComponent);
        if (aComp && aComp.type === 'aegis') {
          const aTrans = world.getComponent(aId, TransformComponent);
          if (aTrans) {
            const domeR = aComp.shieldDomeRadius || 115;
            const d = Math.hypot(targetTrans.x - aTrans.x, targetTrans.y - aTrans.y);
            if (d <= domeR) {
              insideAegisDome = true;
              break;
            }
          }
        }
      }
      if (insideAegisDome) {
        netDamage = Math.max(1, Math.round(netDamage * 0.5));
      }
    }
  }

  return netDamage;
}

// Use current protection; dome membership can change before a projectile arrives.
export function getExpectedInFlightDamage(world) {
  const damageByTarget = new Map();
  for (const id of world.getEntitiesWith(ProjectileComponent)) {
    const projectile = world.getComponent(id, ProjectileComponent);
    if (projectile.isEnemy || projectile.targetEntityId == null) continue;
    const damage = calculateMitigatedDamage(world, projectile.targetEntityId, projectile.damage || 0);
    damageByTarget.set(projectile.targetEntityId, (damageByTarget.get(projectile.targetEntityId) || 0) + damage);
  }
  return damageByTarget;
}
