/**
 * WeaponSystem.js
 * Manages attack timers, calculates critical strikes and multishot spreads,
 * and instantiates projectile entities.
 */

import { TowerComponent } from '../components/TowerComponent.js';
import { AttackComponent } from '../components/AttackComponent.js';
import { TargetComponent } from '../components/TargetComponent.js';
import { TransformComponent } from '../components/TransformComponent.js';
import { VelocityComponent } from '../components/VelocityComponent.js';
import { ProjectileComponent } from '../components/ProjectileComponent.js';
import { CircleColliderComponent } from '../components/CircleColliderComponent.js';
import { RenderComponent } from '../components/RenderComponent.js';
import { EnemyComponent } from '../components/EnemyComponent.js';
import { HealthComponent } from '../components/HealthComponent.js';
import { GameConfig } from '../config/GameConfig.js';

export class WeaponSystem {
  update(world, deltaTime) {
    const towers = world.getEntitiesWith(TowerComponent, AttackComponent, TargetComponent, TransformComponent);
    if (towers.length === 0) return;

    const towerId = towers[0];
    const attack = world.getComponent(towerId, AttackComponent);
    const targetComp = world.getComponent(towerId, TargetComponent);
    const towerTrans = world.getComponent(towerId, TransformComponent);

    // Decrement attack cooldown
    if (attack.cooldown > 0) {
      attack.cooldown -= deltaTime;
    }

    if (attack.cooldown > 0) {
      return;
    }

    // 1. Calculate in-flight damage targeted at each enemy by player projectiles
    const inFlightDamage = new Map();
    const projEntities = world.getEntitiesWith(ProjectileComponent);
    for (const pId of projEntities) {
      const proj = world.getComponent(pId, ProjectileComponent);
      if (proj && !proj.isEnemy && proj.targetEntityId) {
        inFlightDamage.set(proj.targetEntityId, (inFlightDamage.get(proj.targetEntityId) || 0) + (proj.damage || 0));
      }
    }

    // 2. Scan for all living enemies strictly within attack range
    const enemyEntities = world.getEntitiesWith(EnemyComponent, TransformComponent, HealthComponent);
    const enemiesInRange = [];

    for (const enemyId of enemyEntities) {
      if (world.destructionQueue.has(enemyId)) continue;
      const eHealth = world.getComponent(enemyId, HealthComponent);
      const eTrans = world.getComponent(enemyId, TransformComponent);
      if (!eHealth || eHealth.current <= 0 || !eTrans) continue;

      const dist = Math.hypot(eTrans.x - towerTrans.x, eTrans.y - towerTrans.y);
      if (dist <= attack.range) {
        const inFlight = inFlightDamage.get(enemyId) || 0;
        enemiesInRange.push({
          id: enemyId,
          trans: eTrans,
          health: eHealth.current,
          effectiveHp: eHealth.current - inFlight,
          dist
        });
      }
    }

    if (enemiesInRange.length === 0) {
      targetComp.targetEntityId = null;
      return;
    }

    // 3. Predictive filtering: prioritize enemies that need damage
    const needyEnemies = enemiesInRange.filter(e => e.effectiveHp > 0);
    if (needyEnemies.length === 0) {
      // All enemies in range are already slated to die from incoming bullets!
      // Hold fire so we don't waste shots or send stray bullets into the void.
      return;
    }

    // Sort needy enemies according to targeting strategy
    const strategy = targetComp.strategy || 'closest';
    if (strategy === 'closest') {
      needyEnemies.sort((a, b) => a.dist - b.dist);
    } else if (strategy === 'strongest') {
      needyEnemies.sort((a, b) => b.health - a.health);
    } else if (strategy === 'weakest') {
      needyEnemies.sort((a, b) => a.health - b.health);
    }

    // Keep primary target consistent if it is in needyEnemies
    const primaryIndex = needyEnemies.findIndex(e => e.id === targetComp.targetEntityId);
    if (primaryIndex > 0) {
      const [primary] = needyEnemies.splice(primaryIndex, 1);
      needyEnemies.unshift(primary);
    } else if (primaryIndex === -1 && needyEnemies.length > 0) {
      targetComp.targetEntityId = needyEnemies[0].id;
    }

    const primaryTarget = needyEnemies[0];

    // Reset cooldown based on attack speed (attacks per second)
    attack.cooldown = 1 / Math.max(0.1, attack.attackSpeed);

    // Calculate critical hit
    const isCrit = Math.random() < attack.critChance;
    const baseDamage = attack.damage;
    const finalDamage = isCrit ? Math.round(baseDamage * attack.critMultiplier) : baseDamage;

    // Multishot calculation
    const triggersMultishot = Math.random() < attack.multishotChance;
    const maxCapacity = triggersMultishot ? 1 + Math.max(1, attack.multishotCount) : 1;

    // STRICT CONSTRAINT: Fired shots cannot exceed the number of actual targets in range needing damage.
    // 1 target in range -> 1 shot. 2 targets in range -> at most 2 shots, etc.
    const shotsToFire = Math.min(maxCapacity, needyEnemies.length);

    // Rotate tower gun towards the primary target
    towerTrans.rotation = Math.atan2(primaryTarget.trans.y - towerTrans.y, primaryTarget.trans.x - towerTrans.x);

    // Spawn 1 projectile for each distinct target in range
    for (let i = 0; i < shotsToFire; i++) {
      const target = needyEnemies[i];
      this._spawnProjectile(world, towerId, towerTrans, target.id, target.trans, finalDamage, isCrit, attack.distanceBonus);
    }

    // Notify event bus for sound and feedback
    world.eventBus.emit('PROJECTILE_FIRED', {
      sourceId: towerId,
      targetId: primaryTarget.id,
      isCrit,
      shotsCount: shotsToFire
    });
  }

  _spawnProjectile(world, towerId, towerTrans, targetId, targetTrans, damage, isCrit, distanceBonus = 0) {
    const projId = world.createEntity();
    const dx = targetTrans.x - towerTrans.x;
    const dy = targetTrans.y - towerTrans.y;
    const dist = Math.hypot(dx, dy) || 1;
    const speed = GameConfig.projectile.speed;

    const vx = (dx / dist) * speed;
    const vy = (dy / dist) * speed;
    const angle = Math.atan2(dy, dx);

    world.addComponent(projId, new TransformComponent(towerTrans.x, towerTrans.y, angle));
    world.addComponent(projId, new VelocityComponent(vx, vy, speed, speed));
    world.addComponent(projId, new ProjectileComponent(
      towerId,
      targetId,
      0,
      GameConfig.projectile.maxLifetime,
      damage,
      isCrit,
      false, // player projectile
      towerTrans.x,
      towerTrans.y,
      distanceBonus
    ));
    world.addComponent(projId, new CircleColliderComponent(GameConfig.projectile.radius, 0.1, false));
    world.addComponent(projId, new RenderComponent(
      'projectile',
      0,
      GameConfig.projectile.radius,
      isCrit ? GameConfig.colors.critText : GameConfig.colors.projectile,
      isCrit ? '#ffe600' : '#00f3ff',
      isCrit ? 16 : 10
    ));
  }
}
