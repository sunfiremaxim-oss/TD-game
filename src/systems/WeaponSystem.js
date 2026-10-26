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
import { DevControlComponent } from '../components/DevControlComponent.js';

import { getExpectedInFlightDamage } from '../combat/DamageCalculation.js?v=2.7';

export class WeaponSystem {
  update(world, deltaTime) {
    const towers = world.getEntitiesWith(TowerComponent, AttackComponent, TargetComponent, TransformComponent);
    if (towers.length === 0) return;

    const towerId = towers[0];
    const dev = world.getComponent(towerId, DevControlComponent);
    if (GameConfig.devTools.enabled && dev?.enabled && dev.firingDisabled) return;
    const attack = world.getComponent(towerId, AttackComponent);
    const targetComp = world.getComponent(towerId, TargetComponent);
    const towerTrans = world.getComponent(towerId, TransformComponent);

    // Cooldown is measured in baseline attack seconds. Only the portion spent
    // inside the buff advances faster, including its final partial frame.
    const boostedTime = Math.min(deltaTime, attack.rapidFireRemaining);
    const attackTime = deltaTime + boostedTime * (GameConfig.combat.rapidFireMultiplier - 1);
    attack.rapidFireRemaining = Math.max(0, attack.rapidFireRemaining - deltaTime);
    attack.aimHoldRemaining = Math.max(0, attack.aimHoldRemaining - attackTime);
    if (attack.cooldown > 0) {
      attack.cooldown -= attackTime;
    }

    if (attack.cooldown > 0) {
      return;
    }

    // 1. Calculate in-flight damage targeted at each enemy by player projectiles
    const inFlightDamage = getExpectedInFlightDamage(world);

    // 2. Scan for all living enemies strictly within attack range
    const enemyEntities = world.getEntitiesWith(EnemyComponent, TransformComponent, HealthComponent);
    const enemiesInRange = [];

    for (const enemyId of enemyEntities) {
      if (world.destructionQueue.has(enemyId)) continue;
      const eHealth = world.getComponent(enemyId, HealthComponent);
      const eTrans = world.getComponent(enemyId, TransformComponent);
      if (!eHealth || eHealth.current <= 0 || !eTrans) continue;

      const distanceSquared = (eTrans.x - towerTrans.x) ** 2 + (eTrans.y - towerTrans.y) ** 2;
      if (distanceSquared <= attack.range ** 2) {
        const inFlight = inFlightDamage.get(enemyId) || 0;
        enemiesInRange.push({
          id: enemyId,
          trans: eTrans,
          effectiveHp: eHealth.current - inFlight,
          distanceSquared
        });
      }
    }

    if (enemiesInRange.length === 0) {
      return;
    }

    // 3. Predictive filtering: prioritize enemies that need damage
    const needyEnemies = enemiesInRange.filter(e => e.effectiveHp > 0);
    if (needyEnemies.length === 0) {
      // All enemies in range are already slated to die from incoming bullets!
      // Hold fire so we don't waste shots or send stray bullets into the void.
      return;
    }

    // Every volley selects the nearest enemies needing damage, with no sticky priority.
    needyEnemies.sort((a, b) => a.distanceSquared - b.distanceSquared);
    const primaryTarget = needyEnemies[0];
    targetComp.targetEntityId = primaryTarget.id;

    if (attack.rapidFireChance > 0 && attack.rapidFireRemaining <= 0 &&
        Math.random() < attack.rapidFireChance) {
      attack.rapidFireRemaining = attack.rapidFireDuration;
      world.eventBus.emit('RAPID_FIRE_STARTED', {
        sourceId: towerId, duration: attack.rapidFireDuration,
        x: towerTrans.x, y: towerTrans.y
      });
    }

    // Reset cooldown based on attack speed (attacks per second)
    attack.cooldown = 1 / Math.max(0.1, attack.attackSpeed);
    attack.aimHoldRemaining = attack.cooldown * GameConfig.tower.aimAfterShotHoldFraction;

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

    // Final alignment happens BEFORE spawning bullets. Last-frame target changes
    // must not delay a scheduled volley or leave the barrel trailing its shot.
    towerTrans.rotation = Math.atan2(primaryTarget.trans.y - towerTrans.y, primaryTarget.trans.x - towerTrans.x);

    // Spawn 1 projectile for each distinct target in range
    for (let i = 0; i < shotsToFire; i++) {
      const target = needyEnemies[i];
      this._spawnProjectile(world, towerId, towerTrans, target.id, target.trans, finalDamage, isCrit, attack.distanceBonus, attack);
    }

    // Notify event bus for sound and feedback
    world.eventBus.emit('PROJECTILE_FIRED', {
      sourceId: towerId,
      targetId: primaryTarget.id,
      isCrit,
      shotsCount: shotsToFire
    });
  }

  _spawnProjectile(world, towerId, towerTrans, targetId, targetTrans, damage, isCrit, distanceBonus = 0, attack = null) {
    const projId = world.createEntity();
    // Every shot in a volley exits the actual barrel, whose angle follows the
    // primary target. Secondary shots steer toward their own targets from here.
    const towerRadius = world.getComponent(towerId, RenderComponent)?.radius ?? GameConfig.tower.radius;
    const barrelLength = towerRadius + GameConfig.tower.barrelExtension;
    const muzzleOffset = Math.max(0, barrelLength - GameConfig.tower.muzzleInset);
    const muzzleX = towerTrans.x + Math.cos(towerTrans.rotation) * muzzleOffset;
    const muzzleY = towerTrans.y + Math.sin(towerTrans.rotation) * muzzleOffset;
    const dx = targetTrans.x - muzzleX;
    const dy = targetTrans.y - muzzleY;
    const angle = dx || dy ? Math.atan2(dy, dx) : towerTrans.rotation;
    const speed = GameConfig.projectile.speed;

    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;

    world.addComponent(projId, new TransformComponent(muzzleX, muzzleY, angle));
    world.addComponent(projId, new VelocityComponent(vx, vy, speed, speed));
    const projectile = new ProjectileComponent(
      towerId,
      targetId,
      0,
      GameConfig.projectile.maxLifetime,
      damage,
      isCrit,
      false, // player projectile
      towerTrans.x, // Keep distance-based damage measured from the tower center.
      towerTrans.y,
      distanceBonus
    );
    projectile.ricochetChance = attack?.ricochetChance || 0;
    projectile.ricochetsRemaining = attack?.ricochetCount || 0;
    world.addComponent(projId, projectile);
    world.addComponent(projId, new CircleColliderComponent(GameConfig.projectile.radius, 0.1, false));
    world.addComponent(projId, new RenderComponent(
      'projectile',
      0,
      GameConfig.projectile.radius,
      isCrit ? GameConfig.colors.critText : attack?.rapidFireRemaining > 0 ? '#ff9cec' : GameConfig.colors.projectile,
      isCrit ? '#ffe600' : attack?.rapidFireRemaining > 0 ? '#ff9cec' : '#00f3ff',
      isCrit ? 16 : 10
    ));
  }
}
