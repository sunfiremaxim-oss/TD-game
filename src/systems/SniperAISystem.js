/**
 * SniperAISystem.js
 * Controls long-range sniper enemies: halts them at the tower attack perimeter
 * and handles their ranged firing loop against the tower.
 */

import { EnemyComponent } from '../components/EnemyComponent.js';
import { TransformComponent } from '../components/TransformComponent.js';
import { VelocityComponent } from '../components/VelocityComponent.js';
import { TowerComponent } from '../components/TowerComponent.js';
import { AttackComponent } from '../components/AttackComponent.js';
import { ProjectileComponent } from '../components/ProjectileComponent.js';
import { CircleColliderComponent } from '../components/CircleColliderComponent.js';
import { RenderComponent } from '../components/RenderComponent.js';
import { GameConfig } from '../config/GameConfig.js';

export class SniperAISystem {
  update(world, deltaTime) {
    const towers = world.getEntitiesWith(TowerComponent, TransformComponent, AttackComponent);
    if (towers.length === 0) return;

    const towerId = towers[0];
    const towerTrans = world.getComponent(towerId, TransformComponent);
    const towerAttack = world.getComponent(towerId, AttackComponent);

    const snipers = world.getEntitiesWith(EnemyComponent, TransformComponent, VelocityComponent)
      .filter(id => world.getComponent(id, EnemyComponent).isSniper);

    // Dynamically calculate stop distance tied to tower attack range (90% of range, max 240px)
    // Ensures snipers always stop within player attack zone regardless of upgrade path
    const currentRange = towerAttack ? towerAttack.range : GameConfig.tower.baseRange;
    const maxStopDist = GameConfig.enemies.sniper.stopDistance || 240;
    const stopDistance = Math.min(maxStopDist, Math.floor(currentRange * 0.90));

    for (const sniperId of snipers) {
      const enemy = world.getComponent(sniperId, EnemyComponent);
      const sniperTrans = world.getComponent(sniperId, TransformComponent);
      const velocity = world.getComponent(sniperId, VelocityComponent);

      const dx = towerTrans.x - sniperTrans.x;
      const dy = towerTrans.y - sniperTrans.y;
      const dist = Math.hypot(dx, dy);

      // Check perimeter threshold
      if (dist <= stopDistance) {
        if (!enemy.isStopped) {
          enemy.isStopped = true;
          // Initial aiming delay before first shot so tower has at least 0.3-0.45s to kill the sniper
          const aimDelay = GameConfig.enemies.sniper.initialAimDelay || 0.45;
          enemy.shootCooldown = Math.max(enemy.shootCooldown, aimDelay);
        }
        velocity.vx = 0;
        velocity.vy = 0;

        // Face towards the tower
        sniperTrans.rotation = Math.atan2(dy, dx);

        // Firing cycle
        if (enemy.shootCooldown > 0) {
          enemy.shootCooldown -= deltaTime;
        }

        if (enemy.shootCooldown <= 0) {
          enemy.shootCooldown = enemy.shootInterval || 2.8;
          this._fireSniperProjectile(world, sniperId, sniperTrans, towerId, towerTrans, enemy.damage);
        }
      } else {
        // Resume approach if pushed away or if tower range changed
        enemy.isStopped = false;
      }
    }
  }

  _fireSniperProjectile(world, sniperId, sniperTrans, towerId, towerTrans, scaledDamage) {
    const projId = world.createEntity();
    const dx = towerTrans.x - sniperTrans.x;
    const dy = towerTrans.y - sniperTrans.y;
    const dist = Math.hypot(dx, dy) || 1;
    const speed = GameConfig.enemies.sniper.projectileSpeed || 220;

    const vx = (dx / dist) * speed;
    const vy = (dy / dist) * speed;
    const angle = Math.atan2(dy, dx);

    const damage = scaledDamage || GameConfig.enemies.sniper.baseDamage || 22;

    world.addComponent(projId, new TransformComponent(sniperTrans.x, sniperTrans.y, angle));
    world.addComponent(projId, new VelocityComponent(vx, vy, speed, speed));
    world.addComponent(projId, new ProjectileComponent(
      sniperId,
      towerId,
      0,
      4.0, // maxLifetime
      damage,
      false, // isCrit
      true   // isEnemy = true
    ));
    world.addComponent(projId, new CircleColliderComponent(5, 0.1, false));
    world.addComponent(projId, new RenderComponent(
      'projectile',
      0,
      5,
      GameConfig.colors.enemyProjectile,
      GameConfig.colors.enemyProjectile,
      12
    ));

    world.eventBus.emit('ENEMY_SNIPER_SHOT', {
      sourceId: sniperId,
      x: sniperTrans.x,
      y: sniperTrans.y
    });
  }
}
