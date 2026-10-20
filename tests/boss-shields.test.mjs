import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/core/World.js';
import { TransformComponent } from '../src/components/TransformComponent.js';
import { VelocityComponent } from '../src/components/VelocityComponent.js';
import { EnemyComponent } from '../src/components/EnemyComponent.js';
import { HealthComponent } from '../src/components/HealthComponent.js';
import { ProjectileComponent } from '../src/components/ProjectileComponent.js';
import { MovementSystem } from '../src/systems/MovementSystem.js';
import { DamageSystem } from '../src/systems/DamageSystem.js';

function entity(world, ...components) {
  const id = world.createEntity();
  for (const component of components) world.addComponent(id, component);
  return id;
}
function setup() {
  const world = new World();
  const movement = new MovementSystem();
  world.registerSystem(movement);
  world.registerSystem(new DamageSystem());
  const boss = entity(world, new EnemyComponent('boss_architect'), new TransformComponent(600, 400), new VelocityComponent(0, 0, 0, 0), new HealthComponent(100, 100));
  const shield = entity(world, new EnemyComponent('boss_shield'), new TransformComponent(678, 400), new VelocityComponent(0, 0, 0, 0), new HealthComponent(10, 10));
  const otherShield = entity(world, new EnemyComponent('boss_shield'), new TransformComponent(522, 400), new VelocityComponent(0, 0, 0, 0), new HealthComponent(10, 10));
  Object.assign(world.getComponent(boss, EnemyComponent), { shieldIds: [shield, otherShield], shieldCount: 2, shieldOrbitRadius: 78, shieldOrbitSpeed: 1.2 });
  return { world, movement, boss, shield, otherShield };
}
function recycleAsProjectile(world, shield) {
  world._flushDestructionQueue();
  const projectile = entity(world, new ProjectileComponent(null, null), new TransformComponent(200, 200), new VelocityComponent(100, 0, 100, 100));
  assert.equal(projectile, shield, 'reproduce reuse of destroyed shield ID');
  return projectile;
}

test('projectile reusing a killed shield ID flies straight instead of orbiting the boss', () => {
  const { world, movement, shield, otherShield } = setup();
  world.eventBus.emit('PROJECTILE_HIT', { targetId: shield, damage: 10 });
  const projectile = recycleAsProjectile(world, shield);
  movement.update(world, 0.1);
  const trans = world.getComponent(projectile, TransformComponent);
  assert.equal(trans.x, 210);
  assert.equal(trans.y, 200);
  const otherTrans = world.getComponent(otherShield, TransformComponent);
  assert.ok(Math.abs(otherTrans.x - (600 + Math.cos(Math.PI + 0.12) * 78)) < 1e-9);
});

test('directly removed shield cannot attach its orbit to a recycled entity', () => {
  const { world, movement, boss, shield } = setup();
  world.destroyEntity(shield);
  const projectile = recycleAsProjectile(world, shield);
  movement.update(world, 0.1);
  assert.equal(world.getComponent(projectile, TransformComponent).x, 210);
  assert.equal(world.getComponent(boss, EnemyComponent).shieldIds[0], null);
});

test('boss death removes remaining shields without removing a projectile using an old shield ID', () => {
  const { world, boss, shield, otherShield } = setup();
  world.destroyEntity(shield);
  const projectile = recycleAsProjectile(world, shield);
  world.eventBus.emit('PROJECTILE_HIT', { targetId: boss, damage: 100 });
  world._flushDestructionQueue();
  assert.equal(world.entityManager.isAlive(projectile), true);
  assert.equal(world.entityManager.isAlive(otherShield), false);
  assert.equal(world.entityManager.isAlive(boss), false);
});

