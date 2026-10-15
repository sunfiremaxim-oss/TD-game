/**
 * DamageSystem.js
 * Applies mitigation formulas (flat defense and percent armor capped at 85%),
 * updates health, executes passive regeneration, and triggers death / game over events.
 */

import { HealthComponent } from '../components/HealthComponent.js';
import { ArmorComponent } from '../components/ArmorComponent.js';
import { TransformComponent } from '../components/TransformComponent.js';
import { TowerComponent } from '../components/TowerComponent.js';
import { EnemyComponent } from '../components/EnemyComponent.js';
import { GameConfig } from '../config/GameConfig.js';

export class DamageSystem {
  init(world) {
    // 1. Listen for player projectile hitting enemy
    world.eventBus.on('PROJECTILE_HIT', (event) => {
      this._applyDamageToEntity(world, event.targetId, event.damage, event.isCrit, event.hitX, event.hitY);
    });

    // 2. Listen for sniper projectile hitting tower
    world.eventBus.on('TOWER_HIT', (event) => {
      const towers = world.getEntitiesWith(TowerComponent);
      if (towers.length > 0) {
        this._applyDamageToEntity(world, towers[0], event.damage, false, event.hitX, event.hitY);
      }
    });

    // 3. Listen for enemy ramming tower
    world.eventBus.on('TOWER_CONTACT', (event) => {
      const towers = world.getEntitiesWith(TowerComponent);
      if (towers.length > 0) {
        // Calculate contact damage based on scaled enemy damage
        const enemyComp = world.getComponent(event.enemyId, EnemyComponent);
        const enemyType = enemyComp ? enemyComp.type : 'scout';
        const contactDamage = (enemyComp && enemyComp.damage) ? enemyComp.damage : (GameConfig.enemies[enemyType]?.baseDamage || 15);
        this._applyDamageToEntity(world, towers[0], contactDamage, false, event.hitX, event.hitY);
      }
    });
  }

  update(world, deltaTime) {
    // Passive health regeneration
    const healthEntities = world.getEntitiesWith(HealthComponent);
    for (const id of healthEntities) {
      const health = world.getComponent(id, HealthComponent);
      if (health.current > 0 && health.current < health.max && health.regenRate > 0) {
        health.current = Math.min(health.max, health.current + health.regenRate * deltaTime);
      }
    }
  }

  _applyDamageToEntity(world, targetId, rawDamage, isCrit, hitX, hitY) {
    const health = world.getComponent(targetId, HealthComponent);
    if (!health || health.current <= 0) return;

    const armor = world.getComponent(targetId, ArmorComponent);
    const isTower = world.hasComponent(targetId, TowerComponent);

    // Armor mitigation: flat subtraction followed by capped percentage reduction
    const flatRed = armor ? (armor.flatReduction || 0) : 0;
    const rawPct = armor ? (armor.percentReduction || 0) : 0;
    const cappedPct = Math.min(0.85, rawPct); // Soft cap at 85%

    const damageAfterFlat = Math.max(1, rawDamage - flatRed);
    let netDamage = Math.max(1, Math.round(damageAfterFlat * (1 - cappedPct)));

    // Aegis Dome Defense: 50% damage reduction for all enemies inside an active Aegis dome
    if (!isTower) {
      const aegises = world.getEntitiesWith(EnemyComponent, TransformComponent);
      const targetTrans = world.getComponent(targetId, TransformComponent);
      if (targetTrans) {
        let insideAegisDome = false;
        for (const aId of aegises) {
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

    health.current -= netDamage;

    // Get position for particle/text feedback
    const trans = world.getComponent(targetId, TransformComponent);
    const posX = hitX !== undefined ? hitX : (trans ? trans.x : 0);
    const posY = hitY !== undefined ? hitY : (trans ? trans.y : 0);

    world.eventBus.emit('DAMAGE_DEALT', {
      targetId,
      netDamage,
      isCrit: !!isCrit,
      isTower,
      x: posX,
      y: posY
    });

    if (isTower) {
      world.eventBus.emit('TOWER_DAMAGED', {
        currentHp: health.current,
        maxHp: health.max,
        damageTaken: netDamage
      });
    }

    // Death check
    if (health.current <= 0) {
      health.current = 0;
      const enemyComp = world.getComponent(targetId, EnemyComponent);

      world.eventBus.emit('ENTITY_DIED', {
        entityId: targetId,
        isTower,
        isEnemy: !isTower,
        enemyType: enemyComp ? enemyComp.type : null,
        baseReward: enemyComp ? enemyComp.baseReward : 0,
        x: posX,
        y: posY
      });

      // Splitter: explodes into 3 fast triangular shards at death position
      if (enemyComp && enemyComp.type === 'splitter') {
        world.eventBus.emit('SPLITTER_SPLIT', {
          x: posX,
          y: posY
        });
      }

      // Boss Architect: destroy any remaining orbiting shield segments
      if (enemyComp && enemyComp.type === 'boss_architect' && enemyComp.shieldIds) {
        for (const sId of enemyComp.shieldIds) {
          if (world.entityManager.isAlive(sId)) {
            world.destroyEntity(sId);
          }
        }
      }

      if (isTower) {
        world.isGameOver = true;
        world.isPaused = true;
        world.eventBus.emit('GAME_OVER', {
          reason: 'TOWER_DESTROYED'
        });
      } else {
        world.destroyEntity(targetId);
      }
    }
  }
}
