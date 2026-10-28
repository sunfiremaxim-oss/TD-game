import { FractalComponent, FractalBranchComponent } from '../components/FractalComponent.js';
import { HealthComponent } from '../components/HealthComponent.js';
import { CircleColliderComponent } from '../components/CircleColliderComponent.js';
import { VelocityComponent } from '../components/VelocityComponent.js';
import { TransformComponent } from '../components/TransformComponent.js';
import { EnemyComponent } from '../components/EnemyComponent.js';
import { GameConfig } from '../config/GameConfig.js';

export function getFractalStopRadius(towerRadius, towerRange) {
  const cfg = GameConfig.enemies.boss_fractal;
  return Math.max(towerRadius + cfg.branchOrbit + GameConfig.enemies.fractal_branch.radius + 6, towerRange * .88);
}

export function getLiveFractalBranchCount(world, fractal) {
  let count = 0;
  for (const part of fractal.branches) {
    if (!part || part.health.current <= 0 || world.destructionQueue.has(part.id) ||
        world.getComponent(part.id,HealthComponent) !== part.health) continue;
    if (world.getComponent(part.id,FractalBranchComponent)?.attached) count++;
  }
  return count;
}

export function detachFractalBranch(world, id) {
  const branch = world.getComponent(id,FractalBranchComponent);
  if (!branch?.attached) return false;
  branch.attached = false;
  const collider = world.getComponent(id,CircleColliderComponent);
  if (collider) collider.isStatic = false;
  const enemy = world.getComponent(id,EnemyComponent), velocity = world.getComponent(id,VelocityComponent);
  const transform = world.getComponent(id,TransformComponent);
  if (enemy && velocity && transform) {
    enemy.scatterTimer = .22;
    velocity.vx = Math.cos(transform.rotation)*90;
    velocity.vy = Math.sin(transform.rotation)*90;
  }
  return true;
}

export function detachFractalChildren(world, id) {
  const fractal = world.getComponent(id,FractalComponent);
  if (!fractal) return;
  for (const part of fractal.branches) {
    if (part && world.getComponent(part.id,HealthComponent) === part.health && part.health.current > 0) detachFractalBranch(world,part.id);
  }
}
