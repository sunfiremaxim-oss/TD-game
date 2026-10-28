import { FractalComponent, FractalBranchComponent } from '../components/FractalComponent.js';
import { TowerComponent } from '../components/TowerComponent.js';
import { TransformComponent } from '../components/TransformComponent.js';
import { HealthComponent } from '../components/HealthComponent.js';
import { AttackComponent } from '../components/AttackComponent.js';
import { CircleColliderComponent } from '../components/CircleColliderComponent.js';
import { EnemyComponent } from '../components/EnemyComponent.js';
import { GameConfig } from '../config/GameConfig.js';
import { getFractalStopRadius, getLiveFractalBranchCount, detachFractalBranch } from '../combat/FractalMechanics.js';

export class FractalAISystem {
  update(world, dt) {
    if (world.inMenu || world.isGameOver || dt <= 0) return;
    for (const id of world.getEntitiesWith(FractalBranchComponent)) {
      const branch = world.getComponent(id,FractalBranchComponent);
      if (branch.attached && (world.getComponent(branch.ownerId,HealthComponent) !== branch.ownerHealth ||
          branch.ownerHealth.current <= 0 || world.destructionQueue.has(branch.ownerId))) detachFractalBranch(world,id);
    }
    const tower = world.getEntitiesWith(TowerComponent,TransformComponent,HealthComponent,AttackComponent,CircleColliderComponent)[0];
    if (tower === undefined || world.getComponent(tower,HealthComponent).current <= 0) return;
    const target = world.getComponent(tower,TransformComponent), cfg = GameConfig.enemies.boss_fractal;
    const stop = getFractalStopRadius(world.getComponent(tower,CircleColliderComponent).radius,world.getComponent(tower,AttackComponent).range);
    for (const id of world.getEntitiesWith(FractalComponent,EnemyComponent,TransformComponent,HealthComponent)) {
      const health = world.getComponent(id,HealthComponent);
      if (health.current <= 0 || world.destructionQueue.has(id)) continue;
      const fractal = world.getComponent(id,FractalComponent), enemy = world.getComponent(id,EnemyComponent);
      const source = world.getComponent(id,TransformComponent);
      fractal.elapsed += dt;source.rotation += enemy.rotationSpeed*dt;
      for (const part of fractal.branches) {
        if (!part || world.getComponent(part.id,HealthComponent) !== part.health || part.health.current <= 0 || world.destructionQueue.has(part.id)) continue;
        const branch = world.getComponent(part.id,FractalBranchComponent);
        if (!branch?.attached || branch.ownerHealth !== health || branch.ownerId !== id) continue;
        const position = world.getComponent(part.id,TransformComponent), angle = source.rotation + branch.slot*Math.PI/2;
        position.x = source.x+Math.cos(angle)*cfg.branchOrbit;position.y = source.y+Math.sin(angle)*cfg.branchOrbit;
        position.rotation = angle;
      }
      if (enemy.knockbackRemaining > 0 || Math.abs(Math.hypot(target.x-source.x,target.y-source.y)-stop) > 3) {
        fractal.phase = 'approach';fractal.phaseRemaining = 0;continue;
      }
      if (fractal.phase === 'approach') {fractal.phase='charge';fractal.phaseRemaining=cfg.chargeDuration;}
      let remaining = dt;
      while (remaining > 1e-9 && health.current > 0 && !world.destructionQueue.has(id) && !world.isGameOver) {
        const step = Math.min(remaining,fractal.phaseRemaining);
        fractal.phaseRemaining -= step;remaining -= step;
        if (fractal.phaseRemaining > 1e-9) break;
        if (fractal.phase === 'charge') {
          fractal.phase='firing';fractal.phaseRemaining=cfg.beamDuration;fractal.shots++;
          const branches = getLiveFractalBranchCount(world,fractal);
          const damage = Math.max(1,Math.round(enemy.damage*(cfg.damageFloor+(1-cfg.damageFloor)*branches/4)));
          const angle = Math.atan2(target.y-source.y,target.x-source.x), radius = world.getComponent(tower,CircleColliderComponent).radius;
          // All visual forks belong to one hit, regardless of their count or frame rate.
          world.eventBus.emit('ENEMY_SNIPER_SHOT',{sourceId:id,x:source.x,y:source.y});
          world.eventBus.emit('TOWER_HIT',{sourceId:id,sourceHealth:health,damage,
            hitX:target.x-Math.cos(angle)*radius,hitY:target.y-Math.sin(angle)*radius});
        } else if (fractal.phase === 'firing') {
          fractal.phase='cooldown';fractal.phaseRemaining=cfg.cooldownDuration;
        } else {fractal.phase='charge';fractal.phaseRemaining=cfg.chargeDuration;}
      }
    }
  }
}
