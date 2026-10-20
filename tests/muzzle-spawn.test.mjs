import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/core/World.js';
import { GameConfig } from '../src/config/GameConfig.js';
import { TowerComponent } from '../src/components/TowerComponent.js';
import { TransformComponent } from '../src/components/TransformComponent.js';
import { RenderComponent } from '../src/components/RenderComponent.js';
import { AttackComponent } from '../src/components/AttackComponent.js';
import { TargetComponent } from '../src/components/TargetComponent.js';
import { CircleColliderComponent } from '../src/components/CircleColliderComponent.js';
import { HealthComponent } from '../src/components/HealthComponent.js';
import { EnemyComponent } from '../src/components/EnemyComponent.js';
import { VelocityComponent } from '../src/components/VelocityComponent.js';
import { ProjectileComponent } from '../src/components/ProjectileComponent.js';
import { WeaponSystem } from '../src/systems/WeaponSystem.js';
import { CollisionSystem } from '../src/systems/CollisionSystem.js';
import { DamageSystem } from '../src/systems/DamageSystem.js';

function entity(world, ...components) {
  const id = world.createEntity();
  for (const component of components) world.addComponent(id, component);
  return id;
}
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} differs from ${expected}`);
function setup(angle = 0, distance = 100, enemyRadius = 12, type = 'scout', towerRadius = 26) {
  const world = new World();
  const attack = new AttackComponent(25, 1.6, 200, 0, 0, 1.6, 2, 0, 0);
  const tower = entity(world, new TowerComponent(), new TransformComponent(600, 400),
    new RenderComponent('tower', 8, towerRadius), attack, new TargetComponent(),
    new CircleColliderComponent(26, 1000, true), new HealthComponent(300, 300));
  const target = entity(world, new EnemyComponent(type),
    new TransformComponent(600 + Math.cos(angle) * distance, 400 + Math.sin(angle) * distance),
    new CircleColliderComponent(enemyRadius), new HealthComponent(1000, 1000));
  world.registerSystem(new DamageSystem());
  return { world, attack, tower, target, weapon: new WeaponSystem() };
}

test('normal and critical bolts start inside the barrel end for every firing direction', () => {
  for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2, 0.7, -2.1]) {
    for (const critical of [false, true]) {
      const { world, attack, tower, weapon } = setup(angle);
      attack.critChance = critical ? 1 : 0;
      weapon.update(world, 0);
      const bullet = world.getEntitiesWith(ProjectileComponent)[0];
      const position = world.getComponent(bullet, TransformComponent);
      const barrelLength = 26 + GameConfig.tower.barrelExtension;
      const offset = barrelLength - GameConfig.tower.muzzleInset;
      close(position.x, 600 + Math.cos(angle) * offset);
      close(position.y, 400 + Math.sin(angle) * offset);
      close(world.getComponent(tower, TransformComponent).rotation, angle);
      const halfBoltLength = critical ? 8 : 6;
      assert.ok(offset - halfBoltLength > 8, 'the bolt must start in the outer barrel section');
      assert.ok(offset + halfBoltLength < barrelLength, 'even its front must still be inside the barrel');
    }
  }
});

test('every multishot bullet shares the physical muzzle, including rapid fire and ricochet payloads', () => {
  for (const rapid of [false, true]) {
    const { world, attack, weapon } = setup(0.4);
    entity(world, new EnemyComponent(), new TransformComponent(495, 400), new CircleColliderComponent(12), new HealthComponent(1000, 1000));
    entity(world, new EnemyComponent(), new TransformComponent(600, 510), new CircleColliderComponent(12), new HealthComponent(1000, 1000));
    Object.assign(attack, { multishotChance: 1, critChance: 1, rapidFireRemaining: rapid ? 1 : 0,
      ricochetChance: 0.25, ricochetCount: 2 });
    weapon.update(world, 0);
    const bullets = world.getEntitiesWith(ProjectileComponent);
    assert.equal(bullets.length, 3);
    for (const id of bullets) {
      const position = world.getComponent(id, TransformComponent);
      const velocity = world.getComponent(id, VelocityComponent);
      const projectile = world.getComponent(id, ProjectileComponent);
      const target = world.getComponent(projectile.targetEntityId, TransformComponent);
      close(position.x, 600 + Math.cos(0.4) * 30);
      close(position.y, 400 + Math.sin(0.4) * 30);
      close(Math.hypot(velocity.vx, velocity.vy), GameConfig.projectile.speed);
      close(Math.atan2(velocity.vy, velocity.vx), Math.atan2(target.y - position.y, target.x - position.x));
      assert.equal(projectile.damage, 40);
      assert.equal(projectile.ricochetChance, 0.25);
      assert.equal(projectile.ricochetsRemaining, 2);
    }
  }
});

test('muzzle position follows the actual rendered tower radius', () => {
  const { world, weapon } = setup(0, 150, 12, 'scout', 40);
  weapon.update(world, 0);
  const bullet = world.getEntitiesWith(ProjectileComponent)[0];
  close(world.getComponent(bullet, TransformComponent).x, 644);
});

for (const [type, radius, distance] of [
  ['splitter_shard', 7, 33], ['scout', 12, 38], ['tank', 22, 48], ['boss_shield', 12, 14]
]) {
  test(`muzzle-spawned shots still damage a ${type} at point-blank range`, () => {
    const { world, target, weapon } = setup(0, distance, radius, type);
    weapon.update(world, 0);
    new CollisionSystem().update(world, 0);
    world._flushDestructionQueue();
    assert.equal(world.getComponent(target, HealthComponent).current, 975);
    assert.equal(world.getEntitiesWith(ProjectileComponent).length, 0);
  });
}

test('a target exactly at the spawn point receives damage without invalid projectile vectors', () => {
  const { world, target, weapon } = setup(0, 30);
  weapon.update(world, 0);
  const bullet = world.getEntitiesWith(ProjectileComponent)[0];
  const velocity = world.getComponent(bullet, VelocityComponent);
  close(Math.hypot(velocity.vx, velocity.vy), GameConfig.projectile.speed);
  new CollisionSystem().update(world, 0);
  assert.equal(world.getComponent(target, HealthComponent).current, 975);
});

test('distance-damage origin and projectile lifetime remain independent of the visual spawn offset', () => {
  const { world, attack, weapon } = setup(0);
  attack.distanceBonus = 0.01;
  weapon.update(world, 0);
  const bullet = world.getEntitiesWith(ProjectileComponent)[0];
  const projectile = world.getComponent(bullet, ProjectileComponent);
  assert.equal(projectile.originX, 600);
  assert.equal(projectile.originY, 400);
  assert.equal(projectile.distanceBonus, 0.01);
  assert.equal(projectile.maxLifetime, GameConfig.projectile.maxLifetime);
  assert.equal(projectile.lifetime, 0);
});
