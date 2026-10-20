import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/core/World.js';
import { TransformComponent } from '../src/components/TransformComponent.js';
import { VelocityComponent } from '../src/components/VelocityComponent.js';
import { CircleColliderComponent } from '../src/components/CircleColliderComponent.js';
import { EnemyComponent } from '../src/components/EnemyComponent.js';
import { TowerComponent } from '../src/components/TowerComponent.js';
import { HealthComponent } from '../src/components/HealthComponent.js';
import { ProjectileComponent } from '../src/components/ProjectileComponent.js';
import { PhysicsSeparationSystem } from '../src/systems/PhysicsSeparationSystem.js';
import { MovementSystem } from '../src/systems/MovementSystem.js';
import { CollisionSystem } from '../src/systems/CollisionSystem.js';
import { DamageSystem } from '../src/systems/DamageSystem.js';

function entity(world, ...components) {
  const id = world.createEntity();
  for (const component of components) world.addComponent(id, component);
  return id;
}
for (const isEnemy of [true, false]) {
  test(`${isEnemy ? 'sniper' : 'tower'} projectile does not push or get pushed by bodies and other projectiles`, () => {
    const world = new World();
    const body = entity(world, new EnemyComponent(), new TransformComponent(200, 100), new CircleColliderComponent(12));
    const bullet = entity(world, new ProjectileComponent(null, null, 0, 2.5, 25, false, isEnemy), new TransformComponent(205, 100), new CircleColliderComponent(4, 0.1));
    const other = entity(world, new ProjectileComponent(), new TransformComponent(206, 100), new CircleColliderComponent(4, 0.1));
    new PhysicsSeparationSystem().update(world, 0.1);
    assert.equal(world.getComponent(body, TransformComponent).x, 200);
    assert.equal(world.getComponent(bullet, TransformComponent).x, 205);
    assert.equal(world.getComponent(other, TransformComponent).x, 206);
  });
}

test('sniper projectile passes through an ally and damages the tower without being pushed off its path', () => {
  const world = new World();
  world.registerSystem(new MovementSystem());
  world.registerSystem(new PhysicsSeparationSystem());
  world.registerSystem(new CollisionSystem());
  world.registerSystem(new DamageSystem());
  const tower = entity(world, new TowerComponent(), new TransformComponent(100, 100), new CircleColliderComponent(26, 1000, true), new HealthComponent(100, 100));
  const ally = entity(world, new EnemyComponent(), new TransformComponent(220, 100), new CircleColliderComponent(12), new HealthComponent(100, 100));
  const bullet = entity(world, new ProjectileComponent(null, tower, 0, 4, 22, false, true), new TransformComponent(242, 100), new CircleColliderComponent(5, 0.1), new VelocityComponent(-220, 0, 220, 220));
  world.update(0.1);
  assert.equal(world.getComponent(bullet, TransformComponent).x, 220);
  assert.equal(world.getComponent(ally, HealthComponent).current, 100);
  assert.equal(world.getComponent(ally, TransformComponent).x, 220);
  for (let i = 0; i < 5; i++) world.update(0.1);
  assert.equal(world.getComponent(tower, HealthComponent).current, 78);
  assert.equal(world.entityManager.isAlive(bullet), false);
});

test('tower projectiles still damage boss shields through the hit detection system', () => {
  const world = new World();
  world.registerSystem(new PhysicsSeparationSystem());
  world.registerSystem(new CollisionSystem());
  world.registerSystem(new DamageSystem());
  const shield = entity(world, new EnemyComponent('boss_shield'), new TransformComponent(200, 100), new CircleColliderComponent(12, 15, true), new HealthComponent(100, 100));
  const bullet = entity(world, new ProjectileComponent(null, shield, 0, 2.5, 25), new TransformComponent(205, 100), new CircleColliderComponent(4, 0.1));
  world.update(0.1);
  assert.equal(world.getComponent(shield, HealthComponent).current, 75);
  assert.equal(world.entityManager.isAlive(bullet), false);
});

test('overlapping enemies still separate', () => {
  const world = new World();
  const a = entity(world, new EnemyComponent(), new TransformComponent(200, 100), new CircleColliderComponent(12));
  const b = entity(world, new EnemyComponent(), new TransformComponent(205, 100), new CircleColliderComponent(12));
  new PhysicsSeparationSystem().update(world, 0.1);
  assert.ok(world.getComponent(a, TransformComponent).x < 200);
  assert.ok(world.getComponent(b, TransformComponent).x > 205);
});
