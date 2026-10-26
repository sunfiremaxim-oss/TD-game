/**
 * DamageSystem.js
 * Applies mitigation formulas (flat defense and percent armor capped at 85%),
 * updates health, executes passive regeneration, and triggers death / game over events.
 */

import { HealthComponent } from '../components/HealthComponent.js';
import { TransformComponent } from '../components/TransformComponent.js';
import { TowerComponent } from '../components/TowerComponent.js';
import { EnemyComponent } from '../components/EnemyComponent.js';
import { GameConfig } from '../config/GameConfig.js';
import { DefenseComponent } from '../components/DefenseComponent.js';
import { CircleColliderComponent } from '../components/CircleColliderComponent.js';
import { DevControlComponent } from '../components/DevControlComponent.js';
import { ArchitectDrillComponent } from '../components/ArchitectDrillComponent.js';

import { calculateMitigatedDamage } from '../combat/DamageCalculation.js?v=2.7';

export class DamageSystem {
  init(world) {
    world.eventBus.on('TOWER_DRILL', event => {
      const sourceHealth = world.getComponent(event.enemyId, HealthComponent);
      const drill = world.getComponent(event.enemyId, ArchitectDrillComponent);
      const enemy = world.getComponent(event.enemyId, EnemyComponent);
      if (world.isGameOver || !drill?.active || !enemy || !sourceHealth || sourceHealth.current <= 0 ||
          world.destructionQueue.has(event.enemyId) || !Number.isFinite(event.seconds) || event.seconds <= 0) return;
      const tower = world.getEntitiesWith(TowerComponent)[0];
      if (tower === undefined) return;
      this._applyDamageToEntity(world, tower, enemy.damage, false, event.hitX, event.hitY,
        { sourceId: event.enemyId, sourceHealth, kind: 'drill', damageScale: event.seconds });
    });
    // 1. Listen for player projectile hitting enemy
    world.eventBus.on('PROJECTILE_HIT', (event) => {
      this._applyDamageToEntity(world, event.targetId, event.damage, event.isCrit, event.hitX, event.hitY,
        { sourceId: event.sourceId, kind: 'projectile' });
    });

    // 2. Listen for sniper projectile hitting tower
    world.eventBus.on('TOWER_HIT', (event) => {
      const towers = world.getEntitiesWith(TowerComponent);
      if (towers.length > 0) {
        this._applyDamageToEntity(world, towers[0], event.damage, false, event.hitX, event.hitY,
          { sourceId: event.sourceId, sourceHealth: event.sourceHealth, kind: 'projectile' });
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
        this._applyDamageToEntity(world, towers[0], contactDamage, false, event.hitX, event.hitY,
          { sourceId: event.enemyId, sourceHealth: world.getComponent(event.enemyId, HealthComponent), kind: 'contact' });
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
    for (const id of world.getEntitiesWith(TowerComponent, DefenseComponent, HealthComponent)) {
      const defense = world.getComponent(id, DefenseComponent);
      const health = world.getComponent(id, HealthComponent);
      const cap = health.max * GameConfig.combat.lifeStealMaxHpPerSecond;
      defense.lifeStealBudget = health.current > 0 ? Math.min(cap, defense.lifeStealBudget + cap * deltaTime) : 0;
    }
  }

  _applyDamageToEntity(world, targetId, rawDamage, isCrit, hitX, hitY, context = null) {
    const health = world.getComponent(targetId, HealthComponent);
    if (!health || health.current <= 0 || world.destructionQueue.has(targetId)) return;

    const isTower = world.hasComponent(targetId, TowerComponent);
    const dev = isTower ? world.getComponent(targetId, DevControlComponent) : null;
    if (GameConfig.devTools.enabled && dev?.enabled && dev.invulnerable) return;
    // Mitigate DPS once, then apply a time slice: flat armor and minimum damage
    // must not become stronger or weaker just because the attack has more ticks.
    const damageScale = context?.damageScale ?? 1;
    const netDamage = calculateMitigatedDamage(world, targetId, rawDamage) * damageScale;

    const actualDamage = Math.min(health.current, netDamage);
    health.current = Math.max(0, health.current - netDamage);

    // Get position for particle/text feedback
    const trans = world.getComponent(targetId, TransformComponent);
    const posX = hitX !== undefined ? hitX : (trans ? trans.x : 0);
    const posY = hitY !== undefined ? hitY : (trans ? trans.y : 0);

    world.eventBus.emit('DAMAGE_DEALT', {
      targetId,
      netDamage,
      actualDamage,
      sourceId: context?.sourceId,
      damageKind: context?.kind,
      isContinuous: context?.damageScale !== undefined,
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
      this._reflectDamage(world, targetId, actualDamage, context);
    } else if (context?.kind === 'projectile' && world.hasComponent(context.sourceId, TowerComponent)) {
      this._applyLifeSteal(world, context.sourceId, actualDamage);
      if (health.current > 0) this._applyKnockback(world, context.sourceId, targetId);
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

      // Remove the reference before this shield ID can be reused by another entity.
      // Keep empty slots so surviving shields retain their original orbit spacing.
      if (enemyComp && enemyComp.type === 'boss_shield') {
        for (const id of world.getEntitiesWith(EnemyComponent)) {
          const boss = world.getComponent(id, EnemyComponent);
          if (boss.type !== 'boss_architect' || !boss.shieldIds) continue;
          for (let i = 0; i < boss.shieldIds.length; i++) {
            if (boss.shieldIds[i] === targetId) boss.shieldIds[i] = null;
          }
        }
      }

      // Boss Architect: destroy any remaining orbiting shield segments
      if (enemyComp && enemyComp.type === 'boss_architect' && enemyComp.shieldIds) {
        for (const sId of enemyComp.shieldIds) {
          const shield = world.getComponent(sId, EnemyComponent);
          if (world.entityManager.isAlive(sId) && shield && shield.type === 'boss_shield') {
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

  _reflectDamage(world, towerId, damageTaken, context) {
    const defense = world.getComponent(towerId, DefenseComponent);
    if (!defense || defense.damageReflection <= 0 || !context?.sourceHealth) return;
    const sourceId = context.sourceId;
    // A sniper can die long before its bullet arrives. Never hit a recycled ID.
    if (!world.hasComponent(sourceId, EnemyComponent) || world.destructionQueue.has(sourceId) ||
        world.getComponent(sourceId, HealthComponent) !== context.sourceHealth || context.sourceHealth.current <= 0) return;
    const damageScale = context.damageScale ?? 1;
    const reflected = Math.floor(damageTaken / damageScale * defense.damageReflection + 1e-9);
    if (reflected <= 0) return;
    this._applyDamageToEntity(world, sourceId, reflected, false, undefined, undefined,
      { sourceId: towerId, kind: 'reflection', ...(context.damageScale !== undefined ? { damageScale } : {}) });
  }

  _applyLifeSteal(world, towerId, damageDealt) {
    const defense = world.getComponent(towerId, DefenseComponent);
    const health = world.getComponent(towerId, HealthComponent);
    if (!defense || defense.lifeSteal <= 0 || !health || health.current <= 0) return;
    const healing = Math.min(damageDealt * defense.lifeSteal, defense.lifeStealBudget,
      health.max * GameConfig.combat.lifeStealMaxHpPerSecond, health.max - health.current);
    if (healing <= 0) return;
    defense.lifeStealBudget -= healing;
    health.current += healing;
    world.eventBus.emit('TOWER_HEALED', { towerId, healing });
  }

  _applyKnockback(world, towerId, targetId) {
    const defense = world.getComponent(towerId, DefenseComponent);
    const enemy = world.getComponent(targetId, EnemyComponent);
    if (!defense || defense.knockbackChance <= 0 || !enemy || enemy.type === 'boss_shield' ||
        enemy.knockbackCooldown > 0 || Math.random() >= defense.knockbackChance) return;
    const origin = world.getComponent(towerId, TransformComponent);
    const target = world.getComponent(targetId, TransformComponent);
    if (!origin || !target) return;
    const mass = world.getComponent(targetId, CircleColliderComponent)?.mass || 1;
    const resistance = enemy.type.startsWith('boss_') ? GameConfig.combat.bossKnockbackMultiplier : 1 / Math.sqrt(Math.max(1, mass));
    const speed = defense.knockbackPower * resistance / GameConfig.combat.knockbackDuration;
    const dx = target.x - origin.x;
    const dy = target.y - origin.y;
    const distance = Math.hypot(dx, dy);
    enemy.knockbackVx = distance > 0 ? dx / distance * speed : speed;
    enemy.knockbackVy = distance > 0 ? dy / distance * speed : 0;
    enemy.knockbackRemaining = GameConfig.combat.knockbackDuration;
    enemy.knockbackCooldown = GameConfig.combat.knockbackRecovery;
    enemy.isStopped = false;
  }
}
