import { CitadelComponent, CitadelGeneratorComponent } from '../components/CitadelComponent.js';
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
import { isCitadelGeneratorAlive, getCitadelStopRadius } from '../combat/CitadelMechanics.js';

export class CitadelAISystem {
  update(world, dt) {
    if (world.inMenu || world.isGameOver || dt <= 0) return;
    // Also handles direct devtool removal, without awarding kills for cleanup.
    for (const id of world.getEntitiesWith(CitadelGeneratorComponent)) {
      const part = world.getComponent(id, CitadelGeneratorComponent);
      if (world.getComponent(part.ownerId, HealthComponent) !== part.ownerHealth ||
          part.ownerHealth.current <= 0 || world.destructionQueue.has(part.ownerId)) world.destroyEntity(id);
    }
    const tower = world.getEntitiesWith(TowerComponent, TransformComponent, AttackComponent, CircleColliderComponent, HealthComponent)[0];
    if (tower === undefined || world.getComponent(tower, HealthComponent).current <= 0) return;
    const target = world.getComponent(tower, TransformComponent), cfg = GameConfig.enemies.boss_citadel;
    for (const id of world.getEntitiesWith(CitadelComponent, EnemyComponent, TransformComponent, HealthComponent)) {
      const health = world.getComponent(id, HealthComponent), boss = world.getComponent(id, CitadelComponent);
      if (health.current <= 0 || world.destructionQueue.has(id)) continue;
      const position = world.getComponent(id, TransformComponent), enemy = world.getComponent(id, EnemyComponent);
      boss.elapsed += dt;
      // Rotation belongs to the whole assembly, not to independently orbiting targets.
      position.rotation += enemy.rotationSpeed * dt;
      let alive = 0;
      for (let slot = 0; slot < boss.generators.length; slot++) {
        const part = boss.generators[slot];
        if (!isCitadelGeneratorAlive(world, part)) { boss.generators[slot] = null; continue; }
        alive++;
        const angle = position.rotation + slot * Math.PI / 3;
        const transform = world.getComponent(part.id, TransformComponent);
        transform.x = position.x + Math.cos(angle) * cfg.generatorOrbit;
        transform.y = position.y + Math.sin(angle) * cfg.generatorOrbit;
        transform.rotation = angle;
      }
      if (!alive) boss.hullExposed = true;
      const stop = getCitadelStopRadius(world.getComponent(tower, CircleColliderComponent).radius,
        world.getComponent(tower, AttackComponent).range, !boss.hullExposed);
      if (enemy.knockbackRemaining > 0 || Math.abs(Math.hypot(target.x-position.x,target.y-position.y)-stop) > 3) continue;
      boss.shotCooldown -= dt;
      while (boss.shotCooldown <= 1e-9) {
        this._fire(world, id, position, health, enemy.damage, tower, target);
        boss.shots++; boss.shotCooldown += cfg.shootInterval;
      }
    }
  }

  _fire(world, id, source, sourceHealth, damage, tower, target) {
    const cfg = GameConfig.enemies.boss_citadel;
    const angle = Math.atan2(target.y-source.y,target.x-source.x), nx = Math.cos(angle), ny = Math.sin(angle);
    const x = source.x + nx * cfg.radius * .42, y = source.y + ny * cfg.radius * .42;
    const bullet = world.createEntity(), speed = cfg.projectileSpeed;
    const shot = new ProjectileComponent(id,tower,0,Math.max(3,Math.hypot(target.x-x,target.y-y)/speed+1),damage,false,true);
    shot.sourceHealth = sourceHealth; shot.isHeavyPlasma = true;
    for (const c of [new TransformComponent(x,y,angle), new VelocityComponent(nx*speed,ny*speed,speed,speed),
      shot, new CircleColliderComponent(9,.1), new RenderComponent('projectile',0,9,'#ddfaff','#69bfff',15)]) world.addComponent(bullet,c);
    world.eventBus.emit('ENEMY_SNIPER_SHOT',{sourceId:id,x,y});
  }
}
