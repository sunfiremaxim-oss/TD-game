import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { World } from '../src/core/World.js';
import { TransformComponent } from '../src/components/TransformComponent.js';
import { VelocityComponent } from '../src/components/VelocityComponent.js';
import { HealthComponent } from '../src/components/HealthComponent.js';
import { ArmorComponent } from '../src/components/ArmorComponent.js';
import { EnemyComponent } from '../src/components/EnemyComponent.js';
import { TowerComponent } from '../src/components/TowerComponent.js';
import { AttackComponent } from '../src/components/AttackComponent.js';
import { TargetComponent } from '../src/components/TargetComponent.js';
import { ProjectileComponent } from '../src/components/ProjectileComponent.js';
import { TargetingSystem } from '../src/systems/TargetingSystem.js';
import { WeaponSystem } from '../src/systems/WeaponSystem.js';
import { DamageSystem } from '../src/systems/DamageSystem.js';
import { WaveSystem } from '../src/systems/WaveSystem.js';
import { GameConfig } from '../src/config/GameConfig.js';
import { calculateMitigatedDamage, getExpectedInFlightDamage } from '../src/combat/DamageCalculation.js?v=2.7';

function entity(world, ...components) {
  const id = world.createEntity();
  for (const component of components) world.addComponent(id, component);
  return id;
}
function setup() {
  const world = new World();
  const tower = entity(world, new TowerComponent(), new TransformComponent(0, 0),
    new AttackComponent(25, 1.6, 130, 0, 0, 1.6, 1, 0, 0), new TargetComponent());
  const target = entity(world, new EnemyComponent(), new TransformComponent(50, 0),
    new HealthComponent(20, 20), new ArmorComponent());
  const aegis = entity(world, new EnemyComponent('aegis'), new TransformComponent(150, 0), new HealthComponent());
  entity(world, new ProjectileComponent(tower, target, 0, 2.5, 25));
  return { world, tower, target, aegis };
}

test('spawned scouts die to one base noncritical hit through wave five, then need a second hit', () => {
  const world = new World();
  const waves = new WaveSystem();
  const damage = new DamageSystem();
  const expectedHp = [17, 19, 21, 23, 25, 27];
  for (let wave = 1; wave <= 6; wave++) {
    waves.currentWave = wave;
    waves._spawnEnemy(world, 'scout');
    const target = world.getEntitiesWith(EnemyComponent)[0];
    const health = world.getComponent(target, HealthComponent);
    assert.equal(health.current, expectedHp[wave - 1]);
    damage._applyDamageToEntity(world, target, GameConfig.tower.baseDamage, false);
    assert.equal(health.current, wave <= 5 ? 0 : 2);
    if (wave === 6) damage._applyDamageToEntity(world, target, GameConfig.tower.baseDamage, false);
    world._flushDestructionQueue();
    assert.equal(world.getEntitiesWith(EnemyComponent).length, 0);
  }
});

test('tower keeps firing at a target that survives incoming damage under an Aegis dome', () => {
  const { world, tower, target } = setup();
  entity(world, new EnemyComponent(), new TransformComponent(70, 0), new HealthComponent());
  assert.equal(getExpectedInFlightDamage(world).get(target), 13);
  new TargetingSystem().update(world, 0);
  assert.equal(world.getComponent(tower, TargetComponent).targetEntityId, target);
  new WeaponSystem().update(world, 0);
  const bullets = world.getEntitiesWith(ProjectileComponent);
  assert.equal(bullets.length, 2);
  assert.equal(world.getComponent(bullets[1], ProjectileComponent).targetEntityId, target);
});

test('tower holds fire when incoming mitigated hits are sufficient', () => {
  const { world, tower, target } = setup();
  entity(world, new ProjectileComponent(tower, target, 0, 2.5, 25));
  assert.equal(getExpectedInFlightDamage(world).get(target), 26);
  new WeaponSystem().update(world, 0);
  assert.equal(world.getEntitiesWith(ProjectileComponent).length, 2);
});

for (const mode of ['outside', 'destroyed', 'self']) {
  test(`Aegis protection is excluded for ${mode}`, () => {
    const { world, target, aegis } = setup();
    if (mode === 'outside') world.getComponent(aegis, TransformComponent).x = 166;
    if (mode === 'destroyed') world.destroyEntity(aegis);
    if (mode === 'self') {
      world.destroyEntity(aegis);
      world.getComponent(target, EnemyComponent).type = 'aegis';
    }
    assert.equal(getExpectedInFlightDamage(world).get(target), 25);
    new WeaponSystem().update(world, 0);
    assert.equal(world.getEntitiesWith(ProjectileComponent).length, 1);
  });
}

test('prediction matches actual armor, dome, per-hit rounding and minimum damage', () => {
  const { world, target } = setup();
  entity(world, new EnemyComponent('aegis'), new TransformComponent(140, 0), new HealthComponent());
  world.registerSystem(new DamageSystem());
  const armor = world.getComponent(target, ArmorComponent);
  armor.flatReduction = 5;
  armor.percentReduction = 0.2;
  for (const rawDamage of [25, 26, 1]) {
    const hp = world.getComponent(target, HealthComponent);
    hp.current = 100;
    const expected = calculateMitigatedDamage(world, target, rawDamage);
    world.eventBus.emit('PROJECTILE_HIT', { targetId: target, damage: rawDamage });
    assert.equal(100 - hp.current, expected);
    assert.equal(expected, rawDamage === 1 ? 1 : rawDamage === 25 ? 8 : 9);
  }
});

test('enemy and untargeted projectiles do not count toward predicted damage', () => {
  const { world, tower, target } = setup();
  entity(world, new ProjectileComponent(tower, target, 0, 2.5, 100, false, true));
  entity(world, new ProjectileComponent(tower, null, 0, 2.5, 100));
  assert.equal(getExpectedInFlightDamage(world).get(target), 13);
});

test('resizing with a flying projectile rescales its position, origin and velocity', async () => {
  const mainUrl = new URL('../src/main.js', import.meta.url);
  const source = await readFile(mainUrl, 'utf8');
  const context = { document: { readyState: 'loading', getElementById: () => ({ clientWidth: 1600, clientHeight: 800 }) }, window: { addEventListener() {} } };
  for (const match of source.matchAll(/import\s+\{([^}]+)\}\s+from\s+'([^']+)';/g)) {
    const module = await import(new URL(match[2], mainUrl));
    for (const name of match[1].split(',').map(value => value.trim())) context[name] = module[name];
  }
  vm.createContext(context);
  vm.runInContext(source.replace(/import\s+[^;]+;\s*/g, '') + '\nthis.GameApp = GameApp;', context);
  const world = new World();
  world.width = 800;
  world.height = 800;
  const id = entity(world, new TransformComponent(200, 300), new VelocityComponent(10, 20),
    new ProjectileComponent(null, null, 0, 2.5, 25, false, false, 100, 150));
  const app = Object.create(context.GameApp.prototype);
  Object.assign(app, { world, canvas: {}, particleSystem: null });
  app._resizeCanvas();
  assert.equal(world.getComponent(id, TransformComponent).x, 400);
  assert.equal(world.getComponent(id, TransformComponent).y, 300);
  assert.equal(world.getComponent(id, ProjectileComponent).originX, 200);
  assert.equal(world.getComponent(id, VelocityComponent).vx, 20);
  assert.equal(world.getComponent(id, VelocityComponent).vy, 20);
});
