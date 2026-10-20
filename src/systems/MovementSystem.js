/**
 * MovementSystem.js
 * Updates entity positions and orientations strictly based on velocity vectors.
 */

import { TransformComponent } from '../components/TransformComponent.js';
import { VelocityComponent } from '../components/VelocityComponent.js';
import { EnemyComponent } from '../components/EnemyComponent.js';
import { TowerComponent } from '../components/TowerComponent.js';
import { CircleColliderComponent } from '../components/CircleColliderComponent.js';
import { ProjectileComponent } from '../components/ProjectileComponent.js';
import { HealthComponent } from '../components/HealthComponent.js';
import { AttackComponent } from '../components/AttackComponent.js';
import { GameConfig } from '../config/GameConfig.js';

export class MovementSystem {
  init(world) {
    // When an entity dies, immediately disconnect homing on all projectiles targeting it
    world.eventBus.on('ENTITY_DIED', (event) => {
      const targetedProjectiles = world.getEntitiesWith(ProjectileComponent);
      for (const id of targetedProjectiles) {
        const proj = world.getComponent(id, ProjectileComponent);
        if (proj && proj.targetEntityId === event.entityId) {
          proj.targetEntityId = null;
        }
      }
    });
  }

  update(world, deltaTime) {
    // 1. Locate tower position and core collider radius
    const towerEntities = world.getEntitiesWith(TowerComponent, TransformComponent, CircleColliderComponent);
    let towerX = world.width / 2;
    let towerY = world.height / 2;
    let towerRadius = 26;

    if (towerEntities.length > 0) {
      const towerTrans = world.getComponent(towerEntities[0], TransformComponent);
      const towerCol = world.getComponent(towerEntities[0], CircleColliderComponent);
      towerX = towerTrans.x;
      towerY = towerTrans.y;
      if (towerCol) towerRadius = towerCol.radius;
    }

    // 2. Steer marching enemies towards tower (with Sniper-Aegis tactical escort synergy)
    const enemyEntities = world.getEntitiesWith(EnemyComponent, TransformComponent, VelocityComponent);

    // Tower attack range for perimeter stopping (snipers and Aegis holding mobile bunker)
    const towerAttack = towerEntities.length > 0 ? world.getComponent(towerEntities[0], AttackComponent) : null;
    const currentTowerRange = towerAttack ? towerAttack.range : (GameConfig.tower?.baseRange || 260);
    const maxStopDist = GameConfig.enemies?.sniper?.stopDistance || 240;
    const perimeterStopDist = Math.min(maxStopDist, Math.floor(currentTowerRange * 0.90));
    const seekDist = GameConfig.enemies?.sniper?.aegisSeekDistance || 350;

    // Pre-filter living Aegis and Sniper entities for escort synergy
    const aliveAegises = [];
    const aliveSnipers = [];
    for (const id of enemyEntities) {
      if (world.destructionQueue.has(id)) continue;
      const comp = world.getComponent(id, EnemyComponent);
      const health = world.getComponent(id, HealthComponent);
      if (!comp || !health || health.current <= 0) continue;

      if (comp.type === 'aegis') {
        const trans = world.getComponent(id, TransformComponent);
        if (trans) aliveAegises.push({ id, comp, trans });
      } else if (comp.isSniper) {
        const trans = world.getComponent(id, TransformComponent);
        if (trans) aliveSnipers.push({ id, comp, trans });
      }
    }

    for (const id of enemyEntities) {
      const transform = world.getComponent(id, TransformComponent);
      const velocity = world.getComponent(id, VelocityComponent);
      const enemyComp = world.getComponent(id, EnemyComponent);
      enemyComp.knockbackCooldown = Math.max(0, enemyComp.knockbackCooldown - deltaTime);

      // Boss shield segments are locked to boss orbit, do not march independently
      if (enemyComp.type === 'boss_shield') {
        velocity.vx = 0;
        velocity.vy = 0;
        continue;
      }

      if (enemyComp.knockbackRemaining > 0 && deltaTime > 0) {
        const activeTime = Math.min(deltaTime, enemyComp.knockbackRemaining);
        velocity.vx = enemyComp.knockbackVx * activeTime / deltaTime;
        velocity.vy = enemyComp.knockbackVy * activeTime / deltaTime;
        enemyComp.knockbackRemaining = Math.max(0, enemyComp.knockbackRemaining - deltaTime);
        enemyComp.isStopped = false;
        continue;
      }

      // Check if enemy is in scatter burst phase (e.g. Splitter shards scattering backwards & to the sides)
      if (enemyComp.scatterTimer > 0) {
        enemyComp.scatterTimer -= deltaTime;
        if (enemyComp.rotationSpeed && enemyComp.rotationSpeed !== 0) {
          transform.rotation += enemyComp.rotationSpeed * deltaTime;
        }
        // Smoothly decelerate scatter impulse towards normal speed
        const damp = Math.pow(0.35, deltaTime);
        velocity.vx *= damp;
        velocity.vy *= damp;
        continue;
      }

      const dx = towerX - transform.x;
      const dy = towerY - transform.y;
      const dist = Math.hypot(dx, dy);

      const col = world.getComponent(id, CircleColliderComponent);
      const enemyRadius = col ? col.radius : 12;
      const stopDist = towerRadius + enemyRadius;

      // Tactical AI: Aegis (Shield Fortress)
      if (enemyComp.type === 'aegis') {
        const domeR = enemyComp.shieldDomeRadius || 115;
        // Check if any alive sniper is currently inside this Aegis's dome
        const hasSniperInDome = aliveSnipers.some(s => {
          return Math.hypot(s.trans.x - transform.x, s.trans.y - transform.y) <= domeR;
        });

        // If Aegis is carrying sniper(s) and reached perimeter -> STOP and hold bunker!
        if (hasSniperInDome && dist <= (perimeterStopDist + 10)) {
          enemyComp.isStopped = true;
          velocity.vx = 0;
          velocity.vy = 0;
          if (enemyComp.rotationSpeed && enemyComp.rotationSpeed !== 0) {
            transform.rotation += enemyComp.rotationSpeed * deltaTime;
          }
          continue;
        } else {
          // If no snipers in dome or haven't reached perimeter yet -> advance as normal
          enemyComp.isStopped = false;
        }
      }

      // Tactical AI: Sniper (Escort or solo approach)
      if (enemyComp.isSniper) {
        // Find nearest alive Aegis within seek distance
        let nearestAegis = null;
        let nearestAegisDist = Infinity;

        for (const a of aliveAegises) {
          const d = Math.hypot(a.trans.x - transform.x, a.trans.y - transform.y);
          if (d <= seekDist && d < nearestAegisDist) {
            nearestAegisDist = d;
            nearestAegis = a;
          }
        }

        const domeR = nearestAegis ? (nearestAegis.comp.shieldDomeRadius || 115) : 0;
        const isInsideAegisDome = nearestAegis && nearestAegisDist <= domeR;

        // Sniper stops if reached perimeter or stopped inside an Aegis bunker
        const shouldStop = dist <= perimeterStopDist || (isInsideAegisDome && nearestAegis.comp.isStopped);

        if (shouldStop) {
          enemyComp.isStopped = true;
          velocity.vx = 0;
          velocity.vy = 0;
          continue;
        } else {
          enemyComp.isStopped = false;
        }

        if (nearestAegis) {
          if (!isInsideAegisDome) {
            // Outside dome: fly towards Aegis at full speed to enter its protective dome
            const safeD = nearestAegisDist > 0.0001 ? nearestAegisDist : 0.0001;
            velocity.vx = ((nearestAegis.trans.x - transform.x) / safeD) * velocity.currentSpeed;
            velocity.vy = ((nearestAegis.trans.y - transform.y) / safeD) * velocity.currentSpeed;
            transform.rotation = Math.atan2(velocity.vy, velocity.vx);
          } else {
            // Inside dome: fly together with Aegis towards the tower!
            const adx = towerX - nearestAegis.trans.x;
            const ady = towerY - nearestAegis.trans.y;
            const adist = Math.hypot(adx, ady) || 1;
            const aVel = world.getComponent(nearestAegis.id, VelocityComponent);
            const aSpeed = aVel ? aVel.currentSpeed : 48;

            let vx = (adx / adist) * aSpeed;
            let vy = (ady / adist) * aSpeed;

            // Gentle centering impulse if sniper wanders towards outer rim of dome
            if (nearestAegisDist > domeR * 0.45) {
              const safeD = nearestAegisDist > 0.0001 ? nearestAegisDist : 0.0001;
              const drift = 18 * (nearestAegisDist / domeR);
              vx += ((nearestAegis.trans.x - transform.x) / safeD) * drift;
              vy += ((nearestAegis.trans.y - transform.y) / safeD) * drift;
            }

            velocity.vx = vx;
            velocity.vy = vy;
            transform.rotation = Math.atan2(ady, adx);
          }
          continue;
        }
        // If no Aegis nearby, sniper falls through to standard march directly to tower below!
      }

      // Handle Blinker 2-second teleport dash and projectile lock clearing
      if (enemyComp.type === 'blinker') {
        enemyComp.blinkCooldown = (enemyComp.blinkCooldown !== undefined ? enemyComp.blinkCooldown : 2.0) - deltaTime;
        if (enemyComp.blinkCooldown <= 0) {
          enemyComp.blinkCooldown = 2.0;
          if (dist > stopDist) {
            const maxBlink = enemyComp.blinkDistance || GameConfig.enemies.blinker?.blinkDistance || 75;
            const teleportDist = Math.min(maxBlink, dist - stopDist);
            const nx = dx / dist;
            const ny = dy / dist;
            const oldX = transform.x;
            const oldY = transform.y;
            transform.x += nx * teleportDist;
            transform.y += ny * teleportDist;

            // Drop homing targeting locks from all active player projectiles targeting this blinker
            const targetedProjectiles = world.getEntitiesWith(ProjectileComponent);
            for (const pId of targetedProjectiles) {
              const proj = world.getComponent(pId, ProjectileComponent);
              if (proj && proj.targetEntityId === id) {
                proj.targetEntityId = null;
              }
            }

            world.eventBus.emit('BLINKER_DASH', {
              entityId: id,
              fromX: oldX,
              fromY: oldY,
              toX: transform.x,
              toY: transform.y
            });
          }
        }
      }

      if (dist > stopDist) {
        velocity.vx = (dx / dist) * velocity.currentSpeed;
        velocity.vy = (dy / dist) * velocity.currentSpeed;

        if (enemyComp.rotationSpeed && enemyComp.rotationSpeed !== 0) {
          transform.rotation += enemyComp.rotationSpeed * deltaTime;
        } else {
          transform.rotation = Math.atan2(dy, dx);
        }
      } else {
        // Enemy is pressing up against the tower core collider!
        velocity.vx = 0;
        velocity.vy = 0;

        // Clamp position firmly to the outer surface of the tower's core collider
        const safeDist = dist > 0.0001 ? dist : 0.0001;
        const nx = (transform.x - towerX) / safeDist;
        const ny = (transform.y - towerY) / safeDist;
        transform.x = towerX + nx * stopDist;
        transform.y = towerY + ny * stopDist;

        if (enemyComp.rotationSpeed && enemyComp.rotationSpeed !== 0) {
          transform.rotation += enemyComp.rotationSpeed * deltaTime;
        } else {
          // Point directly into the core
          transform.rotation = Math.atan2(dy, dx);
        }
      }
    }

    // 3. Steer homing player projectiles toward their target
    const targetedProjectiles = world.getEntitiesWith(ProjectileComponent, TransformComponent, VelocityComponent);
    for (const id of targetedProjectiles) {
      const proj = world.getComponent(id, ProjectileComponent);
      if (proj.targetEntityId && !proj.isEnemy) {
        const isTargetAlive = world.entityManager.isAlive(proj.targetEntityId) &&
                              !world.destructionQueue.has(proj.targetEntityId);
        const targetHealth = world.getComponent(proj.targetEntityId, HealthComponent);
        const isEnemy = world.hasComponent(proj.targetEntityId, EnemyComponent);

        if (!isTargetAlive || !targetHealth || targetHealth.current <= 0 || !isEnemy) {
          // Target died or was destroyed: disconnect homing permanently!
          // Projectile keeps its current velocity vector and flies straight forward.
          proj.targetEntityId = null;
        } else {
          const targetTrans = world.getComponent(proj.targetEntityId, TransformComponent);
          if (targetTrans) {
            const trans = world.getComponent(id, TransformComponent);
            const velocity = world.getComponent(id, VelocityComponent);
            const dx = targetTrans.x - trans.x;
            const dy = targetTrans.y - trans.y;
            const dist = Math.hypot(dx, dy);
            if (dist > 1) {
              velocity.vx = (dx / dist) * velocity.currentSpeed;
              velocity.vy = (dy / dist) * velocity.currentSpeed;
              trans.rotation = Math.atan2(dy, dx);
            }
          }
        }
      }
    }

    // 4. Integrate velocity into transform for all moving entities
    const movingEntities = world.getEntitiesWith(TransformComponent, VelocityComponent);
    for (const id of movingEntities) {
      const transform = world.getComponent(id, TransformComponent);
      const velocity = world.getComponent(id, VelocityComponent);

      transform.x += velocity.vx * deltaTime;
      transform.y += velocity.vy * deltaTime;
    }

    // 4.5 Update orbiting shield segments for Boss Architect
    for (const id of enemyEntities) {
      const enemyComp = world.getComponent(id, EnemyComponent);
      if (enemyComp && enemyComp.type === 'boss_architect') {
        const bossTrans = world.getComponent(id, TransformComponent);
        if (!bossTrans) continue;

        enemyComp.shieldOrbitAngle = (enemyComp.shieldOrbitAngle || 0) + (enemyComp.shieldOrbitSpeed || 1.25) * deltaTime;
        const orbitR = enemyComp.shieldOrbitRadius || 78;
        const shieldIds = enemyComp.shieldIds || [];
        const totalSlots = enemyComp.shieldCount || shieldIds.length;

        for (let i = 0; i < shieldIds.length; i++) {
          const sId = shieldIds[i];
          const shieldComp = world.getComponent(sId, EnemyComponent);
          if (sId === null || !world.entityManager.isAlive(sId) || world.destructionQueue.has(sId) ||
              !shieldComp || shieldComp.type !== 'boss_shield') {
            // IDs are recycled: a destroyed shield's old ID may now belong to a projectile.
            shieldIds[i] = null;
            continue;
          }
          const sTrans = world.getComponent(sId, TransformComponent);
          if (sTrans) {
            const segAngle = enemyComp.shieldOrbitAngle + (i / totalSlots) * Math.PI * 2;
            sTrans.x = bossTrans.x + Math.cos(segAngle) * orbitR;
            sTrans.y = bossTrans.y + Math.sin(segAngle) * orbitR;
            sTrans.rotation = segAngle + Math.PI / 2;
          }
        }
      }
    }

    // 5. Clean up projectiles flying off-screen (bounds + 80px margin)
    const allProjectiles = world.getEntitiesWith(ProjectileComponent, TransformComponent);
    for (const id of allProjectiles) {
      const trans = world.getComponent(id, TransformComponent);
      if (trans.x < -80 || trans.x > world.width + 80 || trans.y < -80 || trans.y > world.height + 80) {
        world.destroyEntity(id);
      }
    }
  }
}
