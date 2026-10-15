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

    // 2. Steer marching enemies towards tower (stopping and pressing up against core collider)
    const enemyEntities = world.getEntitiesWith(EnemyComponent, TransformComponent, VelocityComponent);
    for (const id of enemyEntities) {
      const transform = world.getComponent(id, TransformComponent);
      const velocity = world.getComponent(id, VelocityComponent);
      const enemyComp = world.getComponent(id, EnemyComponent);

      // Boss shield segments are locked to boss orbit, do not march independently
      if (enemyComp.type === 'boss_shield') {
        velocity.vx = 0;
        velocity.vy = 0;
        continue;
      }

      // Check if sniper is stopped at perimeter (handled by SniperAISystem)
      if (enemyComp.isSniper && enemyComp.isStopped) {
        velocity.vx = 0;
        velocity.vy = 0;
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

      // Handle Blinker 2-second teleport dash and projectile lock clearing
      if (enemyComp.type === 'blinker') {
        enemyComp.blinkCooldown = (enemyComp.blinkCooldown !== undefined ? enemyComp.blinkCooldown : 2.0) - deltaTime;
        if (enemyComp.blinkCooldown <= 0) {
          enemyComp.blinkCooldown = 2.0;
          if (dist > stopDist) {
            const teleportDist = Math.min(85, dist - stopDist);
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
          if (sId !== null && world.entityManager.isAlive(sId) && !world.destructionQueue.has(sId)) {
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
