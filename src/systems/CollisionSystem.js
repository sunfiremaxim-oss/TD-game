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
          if (enemyHealth.current <= 0) continue;

          const enemyTrans = world.getComponent(enemyId, TransformComponent);
          const enemyCol = world.getComponent(enemyId, CircleColliderComponent);

          const dist = Math.hypot(enemyTrans.x - projTrans.x, enemyTrans.y - projTrans.y);
          if (dist <= projCol.radius + enemyCol.radius) {
            // Distance damage scaling: damage increases slightly per unit traveled from origin
            const traveledDist = Math.hypot(projTrans.x - (proj.originX || projTrans.x), projTrans.y - (proj.originY || projTrans.y));
            const distMultiplier = 1 + (traveledDist * (proj.distanceBonus || 0));
            const finalDamage = Math.max(1, Math.round(proj.damage * distMultiplier));

            world.eventBus.emit('PROJECTILE_HIT', {
              projectileId: projId,
              targetId: enemyId,
              damage: finalDamage,
              isCrit: proj.isCrit,
              hitX: projTrans.x,
              hitY: projTrans.y
            });
            world.destroyEntity(projId);
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
        if (!enemyComp || enemyComp.isSniper || enemyComp.type === 'boss_shield') continue; // Snipers shoot from afar, boss shields are armor

        const enemyTrans = world.getComponent(enemyId, TransformComponent);
        const enemyCol = world.getComponent(enemyId, CircleColliderComponent);

        const dist = Math.hypot(towerTrans.x - enemyTrans.x, towerTrans.y - enemyTrans.y);
        const contactDist = towerCol.radius + enemyCol.radius + 3; // 3px contact tolerance

        if (dist <= contactDist) {
          if (enemyComp.meleeCooldown > 0) {
            enemyComp.meleeCooldown -= deltaTime;
          }

          // Strike the core every 1.0s while contacting
          if (enemyComp.meleeCooldown <= 0) {
            enemyComp.meleeCooldown = enemyComp.meleeInterval || 1.0;

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
}
