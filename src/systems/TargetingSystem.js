/**
 * TargetingSystem.js
 * Scans for enemies within tower range and assigns targets based on strategy.
 */

import { TowerComponent } from '../components/TowerComponent.js';
import { AttackComponent } from '../components/AttackComponent.js';
import { TargetComponent } from '../components/TargetComponent.js';
import { TransformComponent } from '../components/TransformComponent.js';
import { EnemyComponent } from '../components/EnemyComponent.js';
import { HealthComponent } from '../components/HealthComponent.js';
import { ProjectileComponent } from '../components/ProjectileComponent.js';

export class TargetingSystem {
  init(world) {
    // Clear targeted entity on death
    world.eventBus.on('ENTITY_DIED', (event) => {
      const towers = world.getEntitiesWith(TowerComponent, TargetComponent);
      for (const tId of towers) {
        const targetComp = world.getComponent(tId, TargetComponent);
        if (targetComp && targetComp.targetEntityId === event.entityId) {
          targetComp.targetEntityId = null;
        }
      }
    });
  }

  update(world, deltaTime) {
    const towers = world.getEntitiesWith(TowerComponent, AttackComponent, TargetComponent, TransformComponent);
    if (towers.length === 0) return;

    const towerId = towers[0];
    const towerTrans = world.getComponent(towerId, TransformComponent);
    const attack = world.getComponent(towerId, AttackComponent);
    const targetComp = world.getComponent(towerId, TargetComponent);

    // 1. Calculate in-flight damage targeted at each enemy by active player projectiles
    const inFlightDamage = new Map();
    const projEntities = world.getEntitiesWith(ProjectileComponent);
    for (const pId of projEntities) {
      const proj = world.getComponent(pId, ProjectileComponent);
      if (proj && !proj.isEnemy && proj.targetEntityId) {
        inFlightDamage.set(proj.targetEntityId, (inFlightDamage.get(proj.targetEntityId) || 0) + (proj.damage || 0));
      }
    }

    // 2. Get all alive enemies strictly within attack range
    const enemyEntities = world.getEntitiesWith(EnemyComponent, TransformComponent, HealthComponent);
    const candidates = [];

    for (const enemyId of enemyEntities) {
      if (world.destructionQueue.has(enemyId)) continue;
      const enemyTrans = world.getComponent(enemyId, TransformComponent);
      const enemyHealth = world.getComponent(enemyId, HealthComponent);

      if (!enemyHealth || enemyHealth.current <= 0 || !enemyTrans) continue;

      const dist = Math.hypot(enemyTrans.x - towerTrans.x, enemyTrans.y - towerTrans.y);
      if (dist <= attack.range) {
        const inFlight = inFlightDamage.get(enemyId) || 0;
        candidates.push({
          id: enemyId,
          dist,
          health: enemyHealth.current,
          effectiveHp: enemyHealth.current - inFlight,
          x: enemyTrans.x,
          y: enemyTrans.y
        });
      }
    }

    if (candidates.length === 0) {
      targetComp.targetEntityId = null;
      return;
    }

    // 3. Predictive targeting: prioritize enemies that still need damage (effectiveHp > 0)
    const needyCandidates = candidates.filter(c => c.effectiveHp > 0);
    const pool = needyCandidates.length > 0 ? needyCandidates : candidates;

    // 4. Sort pool according to active strategy
    const strategy = targetComp.strategy || 'closest';
    if (strategy === 'closest') {
      pool.sort((a, b) => a.dist - b.dist);
    } else if (strategy === 'strongest') {
      pool.sort((a, b) => b.health - a.health);
    } else if (strategy === 'weakest') {
      pool.sort((a, b) => a.health - b.health);
    }

    const chosen = pool[0];
    targetComp.targetEntityId = chosen.id;

    // Rotate tower gun towards target
    const angle = Math.atan2(chosen.y - towerTrans.y, chosen.x - towerTrans.x);
    towerTrans.rotation = angle;
  }
}
