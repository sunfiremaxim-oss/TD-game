import { RailgunComponent } from '../components/RailgunComponent.js';
import { TowerComponent } from '../components/TowerComponent.js';
import { TransformComponent } from '../components/TransformComponent.js';
import { CircleColliderComponent } from '../components/CircleColliderComponent.js';
import { AttackComponent } from '../components/AttackComponent.js';
import { HealthComponent } from '../components/HealthComponent.js';
import { EnemyComponent } from '../components/EnemyComponent.js';
import { GameConfig } from '../config/GameConfig.js';
import { getRailgunOrbitRadius } from '../combat/RailgunMechanics.js';

export class RailgunAISystem {
  update(world, deltaTime) {
    if (world.inMenu || world.isGameOver || deltaTime <= 0) return;
    const bosses = world.getEntitiesWith(RailgunComponent, EnemyComponent, TransformComponent, CircleColliderComponent, HealthComponent);
    if (!bosses.length) return;
    const tower = world.getEntitiesWith(TowerComponent, TransformComponent, AttackComponent, CircleColliderComponent, HealthComponent)[0];
    if (tower === undefined || world.getComponent(tower, HealthComponent).current <= 0) return;
    const target = world.getComponent(tower, TransformComponent), cfg = GameConfig.enemies.boss_railgun;
    for (const id of bosses) {
      const health = world.getComponent(id, HealthComponent), enemy = world.getComponent(id, EnemyComponent);
      const rail = world.getComponent(id, RailgunComponent), position = world.getComponent(id, TransformComponent);
      if (health.current <= 0) continue;
      const radius = getRailgunOrbitRadius(world.getComponent(tower, CircleColliderComponent).radius,
        world.getComponent(id, CircleColliderComponent).radius, world.getComponent(tower, AttackComponent).range);
      if (enemy.knockbackRemaining > 0 || Math.abs(Math.hypot(target.x-position.x,target.y-position.y)-radius) > 3) {
        rail.phase = 'approach'; rail.phaseRemaining = 0;
        continue;
      }
      if (rail.phase === 'approach') { rail.phase = 'charge'; rail.phaseRemaining = cfg.chargeDuration; }
      rail.elapsed += deltaTime;
      let remaining = deltaTime;
      while (remaining > 1e-9 && health.current > 0 && !world.destructionQueue.has(id) && !world.isGameOver) {
        const step = Math.min(remaining, rail.phaseRemaining);
        rail.phaseRemaining -= step; remaining -= step;
        if (rail.phaseRemaining > 1e-9) break;
        if (rail.phase === 'charge') {
          rail.phase = 'firing'; rail.phaseRemaining = cfg.beamDuration; rail.shots++;
          const angle = Math.atan2(target.y-position.y,target.x-position.x);
          const hitX = target.x - Math.cos(angle) * world.getComponent(tower,CircleColliderComponent).radius;
          const hitY = target.y - Math.sin(angle) * world.getComponent(tower,CircleColliderComponent).radius;
          world.eventBus.emit('ENEMY_SNIPER_SHOT',{sourceId:id,x:position.x,y:position.y});
          world.eventBus.emit('TOWER_HIT',{sourceId:id,sourceHealth:health,damage:enemy.damage,hitX,hitY});
        } else if (rail.phase === 'firing') {
          rail.phase = 'cooldown'; rail.phaseRemaining = cfg.cooldownDuration;
        } else if (rail.phase === 'cooldown') {
          rail.phase = 'reposition'; rail.phaseRemaining = cfg.repositionDuration;
          rail.orbitDirection *= -1;
        } else {
          rail.phase = 'charge'; rail.phaseRemaining = cfg.chargeDuration;
        }
      }
    }
  }
}
