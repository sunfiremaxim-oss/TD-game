/**
 * TargetingSystem.js
 * Tracks the nearest enemy needing damage, including pre-aim outside firing range.
 */

import { TowerComponent } from '../components/TowerComponent.js';
import { AttackComponent } from '../components/AttackComponent.js';
import { TargetComponent } from '../components/TargetComponent.js';
import { TransformComponent } from '../components/TransformComponent.js';
import { EnemyComponent } from '../components/EnemyComponent.js';
import { HealthComponent } from '../components/HealthComponent.js';
import { GameConfig } from '../config/GameConfig.js';
import { isCombatTargetAvailable } from '../combat/CitadelMechanics.js';
import { getContactTarget } from '../combat/ContactTargeting.js';

import { getExpectedInFlightDamage } from '../combat/DamageCalculation.js?v=2.7';

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
        if (targetComp?.contactTargetId===event.entityId) {targetComp.contactTargetId=null;targetComp.contactTargetHealth=null;}
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
    const inFlightDamage = getExpectedInFlightDamage(world);

    // 2. Track globally; WeaponSystem alone enforces the firing range.
    const enemyEntities = world.getEntitiesWith(EnemyComponent, TransformComponent, HealthComponent);
    const contactId = getContactTarget(world,towerId,targetComp,attack.range,enemyEntities);
    let nearest = null;
    let nearestNeedingDamage = null;

    for (const enemyId of enemyEntities) {
      if (world.destructionQueue.has(enemyId) || !isCombatTargetAvailable(world,enemyId)) continue;
      const enemyTrans = world.getComponent(enemyId, TransformComponent);
      const enemyHealth = world.getComponent(enemyId, HealthComponent);

      if (!enemyHealth || enemyHealth.current <= 0 || !enemyTrans) continue;

      const distanceSquared = (enemyTrans.x - towerTrans.x) ** 2 + (enemyTrans.y - towerTrans.y) ** 2;
      const candidate = { id: enemyId, distanceSquared, x: enemyTrans.x, y: enemyTrans.y };
      if (!nearest || distanceSquared < nearest.distanceSquared) nearest = candidate;
      if (enemyHealth.current > (inFlightDamage.get(enemyId) || 0) &&
          (!nearestNeedingDamage || distanceSquared < nearestNeedingDamage.distanceSquared)) {
        nearestNeedingDamage = candidate;
      }
    }

    const contactPosition = contactId==null?null:world.getComponent(contactId,TransformComponent);
    const chosen = contactPosition ? {id:contactId,x:contactPosition.x,y:contactPosition.y,
      distanceSquared:(contactPosition.x-towerTrans.x)**2+(contactPosition.y-towerTrans.y)**2} : nearestNeedingDamage || nearest;
    if (!chosen) {
      targetComp.targetEntityId = null;
      return;
    }

    targetComp.targetEntityId = chosen.id;

    // Pre-aim between shots. Firing deadlines take priority over the normal turn rate.
    const angle = Math.atan2(chosen.y - towerTrans.y, chosen.x - towerTrans.x);
    const canFire = Boolean(nearestNeedingDamage) && chosen.distanceSquared <= attack.range ** 2;
    this._rotateTowardsTarget(towerTrans, attack, angle, deltaTime, canFire);
  }

  _rotateTowardsTarget(transform, attack, angle, deltaTime, canFire) {
    const difference = Math.atan2(Math.sin(angle - transform.rotation), Math.cos(angle - transform.rotation));
    // Use exactly the same baseline attack-time advance as WeaponSystem,
    // including the partial frame in which rapid fire expires.
    const boostedTime = Math.min(deltaTime, attack.rapidFireRemaining);
    const attackTime = deltaTime + boostedTime * (GameConfig.combat.rapidFireMultiplier - 1);
    // WeaponSystem owns the timer, including frames with no target. Only the
    // portion after the post-shot hold may be used to turn this frame.
    const heldTime = Math.min(attackTime, attack.aimHoldRemaining);
    const turnTime = attackTime - heldTime;
    const normalStep = Math.PI * Math.max(0.1, attack.attackSpeed) * turnTime / GameConfig.tower.aimTurnIntervalFraction;
    // A late target switch must finish by the existing shot time; never add an aiming cooldown.
    const remainingAfterHold = attack.cooldown - heldTime;
    const deadlineStep = !canFire ? 0 : remainingAfterHold > 0
      ? Math.abs(difference) * Math.min(1, turnTime / remainingAfterHold)
      : Math.abs(difference);
    const step = Math.max(normalStep, deadlineStep);
    transform.rotation = step >= Math.abs(difference)
      ? angle
      : Math.atan2(Math.sin(transform.rotation + Math.sign(difference) * step),
        Math.cos(transform.rotation + Math.sign(difference) * step));
  }
}
