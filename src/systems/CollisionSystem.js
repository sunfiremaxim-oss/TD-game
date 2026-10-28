/**
 * CollisionSystem.js
 * Detects physical overlaps between projectiles, enemies, and the central tower.
 * Purely detects contacts and dispatches collision events via EventBus.
 */

import { TransformComponent } from '../components/TransformComponent.js';
import { CircleColliderComponent } from '../components/CircleColliderComponent.js';
import { ProjectileComponent } from '../components/ProjectileComponent.js';
import { EnemyComponent } from '../components/EnemyComponent.js';
import { TowerComponent } from '../components/TowerComponent.js';
import { HealthComponent } from '../components/HealthComponent.js';
import { VelocityComponent } from '../components/VelocityComponent.js';
import { RenderComponent } from '../components/RenderComponent.js';
import { GameConfig } from '../config/GameConfig.js';
import { ArchitectDrillComponent } from '../components/ArchitectDrillComponent.js';
import { ArchitectSiegeComponent } from '../components/ArchitectSiegeComponent.js';
import { isCombatTargetAvailable } from '../combat/CitadelMechanics.js';
import { canEnemyMelee } from '../combat/ContactTargeting.js';

export class CollisionSystem {
  update(world, deltaTime) {
    const towers = world.getEntitiesWith(TowerComponent, TransformComponent, CircleColliderComponent);
    const hasTower = towers.length > 0;
    const towerId = hasTower ? towers[0] : null;
    const towerTrans = hasTower ? world.getComponent(towerId, TransformComponent) : null;
    const towerCol = hasTower ? world.getComponent(towerId, CircleColliderComponent) : null;

    const projectiles = world.getEntitiesWith(ProjectileComponent, TransformComponent, CircleColliderComponent);
    const enemies = world.getEntitiesWith(EnemyComponent, TransformComponent, CircleColliderComponent, HealthComponent);

    // 1. Process projectiles
    for (const projId of projectiles) {
      if (world.destructionQueue.has(projId)) continue;
      const proj = world.getComponent(projId, ProjectileComponent);
      const projTrans = world.getComponent(projId, TransformComponent);
      const projCol = world.getComponent(projId, CircleColliderComponent);

      proj.lifetime += deltaTime;

      // Check max lifetime expiration
      if (proj.lifetime >= proj.maxLifetime) {
        world.destroyEntity(projId);
        continue;
      }

      if (!proj.isEnemy) {
        // Player projectile hitting enemies
        let hit = false;
        for (const enemyId of enemies) {
          const enemyHealth = world.getComponent(enemyId, HealthComponent);
          if (enemyHealth.current <= 0 || world.destructionQueue.has(enemyId) || proj.hitTargets?.has(enemyHealth) || !isCombatTargetAvailable(world,enemyId)) continue;

          const enemyTrans = world.getComponent(enemyId, TransformComponent);
          const enemyCol = world.getComponent(enemyId, CircleColliderComponent);

          const dist = Math.hypot(enemyTrans.x - projTrans.x, enemyTrans.y - projTrans.y);
          if (dist <= projCol.radius + enemyCol.radius) {
            // Distance damage scaling: damage increases slightly per unit traveled from origin
            const traveledDist = Math.hypot(projTrans.x - proj.originX, projTrans.y - proj.originY);
            const distMultiplier = 1 + (traveledDist * (proj.distanceBonus || 0));
            const finalDamage = Math.max(1, Math.round(proj.damage * distMultiplier));

            if (proj.ricochetChance > 0) {
              if (!proj.hitTargets) proj.hitTargets = new Set();
              proj.hitTargets.add(enemyHealth);
            }

            world.eventBus.emit('PROJECTILE_HIT', {
              projectileId: projId,
              sourceId: proj.sourceEntityId,
              targetId: enemyId,
              damage: finalDamage,
              isCrit: proj.isCrit,
              hitX: projTrans.x,
              hitY: projTrans.y
            });
            if (!this._redirectRicochet(world, projId, proj, projTrans, enemies, finalDamage)) world.destroyEntity(projId);
            hit = true;
            break;
          }
        }
        if (hit) continue;
      } else {
        // Enemy projectile hitting the tower
        if (hasTower) {
          const dist = Math.hypot(towerTrans.x - projTrans.x, towerTrans.y - projTrans.y);
          if (dist <= projCol.radius + towerCol.radius) {
            world.eventBus.emit('TOWER_HIT', {
              projectileId: projId,
              sourceId: proj.sourceEntityId,
              sourceHealth: proj.sourceHealth,
              damage: proj.damage,
              hitX: projTrans.x,
              hitY: projTrans.y
            });
            world.destroyEntity(projId);
            continue;
          }
        }
      }
    }

    // 2. Process enemy body contact with tower (periodic melee gnaw attack every 1 second)
    if (hasTower) {
      for (const enemyId of enemies) {
        const enemyHealth = world.getComponent(enemyId, HealthComponent);
        if (enemyHealth.current <= 0) continue;

        const enemyComp = world.getComponent(enemyId, EnemyComponent);
        if (enemyComp) enemyComp.meleeAttackRemaining=Math.max(0,(enemyComp.meleeAttackRemaining||0)-deltaTime);
        if (!enemyComp) continue;
        const drill = enemyComp.type === 'boss_architect' ? world.getComponent(enemyId, ArchitectDrillComponent) : null;
        if (!drill && !canEnemyMelee(world,enemyId)) continue;

        const enemyTrans = world.getComponent(enemyId, TransformComponent);
        const enemyCol = world.getComponent(enemyId, CircleColliderComponent);

        const dist = Math.hypot(towerTrans.x - enemyTrans.x, towerTrans.y - enemyTrans.y);
        if (drill) {
          const cfg = GameConfig.enemies.boss_architect;
          const siege = world.getComponent(enemyId, ArchitectSiegeComponent);
          const towerHealth = world.getComponent(towerId, HealthComponent);
          const reach = towerCol.radius + enemyCol.radius + cfg.drillGap;
          if (world.isGameOver || world.destructionQueue.has(enemyId) || !towerHealth || towerHealth.current <= 0 ||
              !drill.aimReady || enemyComp.knockbackRemaining > 0 || dist > reach + 0.5) {
            drill.active = false; drill.elapsed = 0; drill.tickRemainder = 0;
            // Displacement stops the beams immediately. Keep the cycle frozen
            // while realigning, so knockback cannot skip an overheating window.
            continue;
          }
          const hitX = towerTrans.x + (enemyTrans.x - towerTrans.x) / Math.max(dist, 1e-9) * towerCol.radius;
          const hitY = towerTrans.y + (enemyTrans.y - towerTrans.y) / Math.max(dist, 1e-9) * towerCol.radius;
          if (siege) this._advanceArchitectSiege(world, enemyId, drill, siege, enemyHealth, deltaTime, hitX, hitY);
          else this._tickArchitectDrill(world, enemyId, drill, enemyHealth, deltaTime, hitX, hitY);
          continue; // Replaces body-contact attacks, including forced overlaps.
        }
        const contactDist = towerCol.radius + enemyCol.radius + 3; // 3px contact tolerance

        if (dist <= contactDist) {
          if (enemyComp.meleeCooldown > 0) {
            enemyComp.meleeCooldown -= deltaTime;
          }

          // Strike the core every 1.0s while contacting
          if (enemyComp.meleeCooldown <= 0) {
            enemyComp.meleeCooldown = enemyComp.meleeInterval || 1.0;
            enemyComp.meleeAttackRemaining = .18;
            enemyComp.meleeAttackAngle = Math.atan2(towerTrans.y-enemyTrans.y,towerTrans.x-enemyTrans.x);

            world.eventBus.emit('TOWER_CONTACT', {
              enemyId,
              hitX: enemyTrans.x,
              hitY: enemyTrans.y
            });
          }
        } else {
          // Reset cooldown so next contact hits immediately
          enemyComp.meleeCooldown = 0;
        }
      }
    }
  }

  _tickArchitectDrill(world, enemyId, drill, health, seconds, hitX, hitY) {
    const interval = GameConfig.enemies.boss_architect.drillTickInterval;
    drill.active = true;
    drill.elapsed += seconds; drill.tickRemainder += seconds;
    while (drill.tickRemainder + 1e-9 >= interval) {
      drill.tickRemainder = Math.max(0, drill.tickRemainder - interval);
      world.eventBus.emit('TOWER_DRILL', { enemyId, seconds: interval, hitX, hitY });
      if (world.isGameOver || health.current <= 0 || world.destructionQueue.has(enemyId)) {
        drill.active = false;
        break;
      }
    }
  }

  _advanceArchitectSiege(world, id, drill, siege, health, seconds, hitX, hitY) {
    const cfg = GameConfig.enemies.boss_architect;
    if (siege.phase === 'approach') {
      siege.phase = 'windup'; siege.phaseRemaining = cfg.siegeWindup;
    }
    // Split boundary-crossing frames: x3 and low FPS must never convert a
    // cooling interval into extra damage, or drop the last drilling ticks.
    let remaining = seconds;
    while (remaining > 1e-9 && !world.isGameOver && health.current > 0 && !world.destructionQueue.has(id)) {
      const step = Math.min(remaining, siege.phaseRemaining);
      if (siege.phase === 'drilling') this._tickArchitectDrill(world, id, drill, health, step, hitX, hitY);
      else { drill.active = false; drill.elapsed = 0; drill.tickRemainder = 0; }
      siege.phaseRemaining = Math.max(0, siege.phaseRemaining - step);
      remaining -= step;
      if (siege.phaseRemaining <= 1e-9) {
        if (siege.phase === 'windup') {
          siege.phase = 'drilling'; siege.phaseRemaining = cfg.siegeDrillDuration;
        } else if (siege.phase === 'drilling') {
          siege.phase = 'overheated'; siege.phaseRemaining = cfg.siegeCoolingDuration; siege.cycles++;
        } else {
          siege.phase = 'windup'; siege.phaseRemaining = cfg.siegeWindup;
        }
      }
    }
    drill.active = siege.phase === 'drilling' && !world.isGameOver && health.current > 0 && !world.destructionQueue.has(id);
    if (!drill.active) { drill.elapsed = 0; drill.tickRemainder = 0; }
  }

  _redirectRicochet(world, projId, projectile, position, enemies, impactDamage) {
    if (projectile.ricochetChance <= 0 || projectile.ricochetsRemaining <= 0) return false;
    if (projectile.ricochetActive === null) projectile.ricochetActive = Math.random() < projectile.ricochetChance;
    if (!projectile.ricochetActive) return false;
    let nextId = null;
    let nextPosition = null;
    let nearestDistance = GameConfig.combat.ricochetRadius;
    for (const id of enemies) {
      const hp = world.getComponent(id, HealthComponent);
      if (!hp || hp.current <= 0 || world.destructionQueue.has(id) || projectile.hitTargets.has(hp) || !isCombatTargetAvailable(world,id)) continue;
      const target = world.getComponent(id, TransformComponent);
      const distance = Math.hypot(target.x - position.x, target.y - position.y);
      if (distance <= nearestDistance) { nextId = id; nextPosition = target; nearestDistance = distance; }
    }
    const velocity = world.getComponent(projId, VelocityComponent);
    if (nextId === null || !velocity) return false;
    projectile.targetEntityId = nextId;
    projectile.ricochetsRemaining--;
    projectile.damage = Math.max(1, Math.round(impactDamage * GameConfig.combat.ricochetDamageRetention));
    projectile.distanceBonus = 0; // Never reapply the original distance bonus on each hop.
    projectile.originX = position.x;
    projectile.originY = position.y;
    const dx = nextPosition.x - position.x;
    const dy = nextPosition.y - position.y;
    const distance = Math.hypot(dx, dy) || 1;
    velocity.vx = dx / distance * velocity.currentSpeed;
    velocity.vy = dy / distance * velocity.currentSpeed;
    position.rotation = Math.atan2(dy, dx);
    const render = world.getComponent(projId, RenderComponent);
    if (render) { render.color = '#b7a3ef'; render.glowColor = '#b7a3ef'; }
    world.eventBus.emit('PROJECTILE_RICOCHET', { projectileId: projId, targetId: nextId, x: position.x, y: position.y });
    return true;
  }
}
