import { CarrierComponent } from '../components/CarrierComponent.js';
import { TowerComponent } from '../components/TowerComponent.js';
import { TransformComponent } from '../components/TransformComponent.js';
import { CircleColliderComponent } from '../components/CircleColliderComponent.js';
import { AttackComponent } from '../components/AttackComponent.js';
import { HealthComponent } from '../components/HealthComponent.js';
import { EnemyComponent } from '../components/EnemyComponent.js';
import { VelocityComponent } from '../components/VelocityComponent.js';
import { ProjectileComponent } from '../components/ProjectileComponent.js';
import { RenderComponent } from '../components/RenderComponent.js';
import { GameConfig } from '../config/GameConfig.js';
import { getCarrierOrbitRadius } from '../combat/CarrierMechanics.js';

export class CarrierAISystem {
  update(world, deltaTime) {
    if (world.inMenu || world.isGameOver || deltaTime <= 0) return;
    const carriers = world.getEntitiesWith(CarrierComponent, EnemyComponent, TransformComponent, CircleColliderComponent, HealthComponent);
    if (!carriers.length) return;
    const tower = world.getEntitiesWith(TowerComponent, TransformComponent, AttackComponent, CircleColliderComponent, HealthComponent)[0];
    if (tower === undefined || world.getComponent(tower, HealthComponent).current <= 0) return;
    const target = world.getComponent(tower, TransformComponent);
    const cfg = GameConfig.enemies.boss_carrier;
    for (const id of carriers) {
      const health = world.getComponent(id, HealthComponent), enemy = world.getComponent(id, EnemyComponent);
      if (health.current <= 0 || enemy.knockbackRemaining > 0) continue;
      const carrier = world.getComponent(id, CarrierComponent), position = world.getComponent(id, TransformComponent);
      const radius = getCarrierOrbitRadius(world.getComponent(tower, CircleColliderComponent).radius,
        world.getComponent(id, CircleColliderComponent).radius, world.getComponent(tower, AttackComponent).range);
      if (carrier.phase === 'approach') {
        if (Math.abs(Math.hypot(target.x - position.x, target.y - position.y) - radius) > 2) continue;
        carrier.phase = 'launch'; carrier.phaseRemaining = cfg.launchWarning;
        carrier.shotCooldown = cfg.shootInterval;
      }
      carrier.elapsed += deltaTime;
      carrier.phaseRemaining -= deltaTime;
      while (carrier.phaseRemaining <= 1e-9 && health.current > 0 && !world.destructionQueue.has(id) && !world.isGameOver) {
        const overshoot = Math.max(0, -carrier.phaseRemaining);
        if (carrier.phase === 'launch') {
          carrier.launches++;
          carrier.pendingLaunch = true;
          world.eventBus.emit('CARRIER_LAUNCH', { carrierId: id });
          carrier.phase = 'exposed'; carrier.phaseRemaining = cfg.exposedDuration - overshoot;
        } else if (carrier.phase === 'exposed') {
          if (carrier.launches >= cfg.maxLaunches) { carrier.phaseRemaining = Infinity; break; }
          carrier.phase = 'reload'; carrier.phaseRemaining = cfg.reloadDuration - overshoot;
        } else {
          carrier.phase = 'launch'; carrier.phaseRemaining = cfg.launchWarning - overshoot;
        }
      }
      if (health.current <= 0 || world.destructionQueue.has(id) || world.isGameOver) continue;
      carrier.shotCooldown -= deltaTime;
      if (carrier.shotCooldown <= 0) {
        this._fire(world, id, position, health, enemy.damage, tower, target);
        carrier.shotCooldown = cfg.shootInterval;
      }
    }
  }

  _fire(world, id, source, sourceHealth, damage, tower, target) {
    const cfg = GameConfig.enemies.boss_carrier;
    const angle = Math.atan2(target.y - source.y, target.x - source.x);
    const nx = Math.cos(angle), ny = Math.sin(angle), muzzle = cfg.radius * .65;
    const x = source.x + nx * muzzle, y = source.y + ny * muzzle;
    const bullet = world.createEntity(), projectile = new ProjectileComponent(id, tower, 0, 4, damage, false, true);
    projectile.sourceHealth = sourceHealth;
    for (const c of [new TransformComponent(x, y, angle), new VelocityComponent(nx * cfg.projectileSpeed, ny * cfg.projectileSpeed, cfg.projectileSpeed, cfg.projectileSpeed),
      projectile, new CircleColliderComponent(5, .1), new RenderComponent('projectile', 0, 5, cfg.color, cfg.glowColor, 10)]) world.addComponent(bullet, c);
    world.eventBus.emit('ENEMY_SNIPER_SHOT', { sourceId: id, x, y });
  }
}
