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
import { MovementSystem } from '../src/systems/MovementSystem.js';
import { CollisionSystem } from '../src/systems/CollisionSystem.js';
import { CircleColliderComponent } from '../src/components/CircleColliderComponent.js';
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

test('first boss marches directly, stays in contact and keeps attacking without retreats or reinforcements', () => {
  const world = new World(), waves = new WaveSystem(), hp = new HealthComponent(10000,10000);
  entity(world,new TowerComponent(),new TransformComponent(600,400),new CircleColliderComponent(26,1000,true),hp);
  for (const system of [new MovementSystem(),new CollisionSystem(),new DamageSystem()]) world.registerSystem(system);
  waves.stageId = 1; waves.currentWave = 10;
  const boss = waves._spawnEnemy(world,'boss_scout',{x:900,y:600});
  world.getComponent(boss,VelocityComponent).currentSpeed = 50;
  const position = world.getComponent(boss,TransformComponent), contacts = [];
  let time = 0; world.eventBus.on('TOWER_CONTACT',e=>{ if(e.enemyId===boss) contacts.push(time); });
  for (; time < 2; time += 1/60) world.update(1/60);
  assert.ok(Math.abs((position.x-600)*200-(position.y-400)*300)<1e-7);
  assert.ok(Math.abs(Math.hypot(position.x-600,position.y-400)-(Math.hypot(300,200)-time*50))<1e-7);
  for (; time < 25; time += 1/60) world.update(1/60);
  assert.ok(Math.abs(Math.hypot(position.x-600,position.y-400)-74)<1e-7);
  assert.ok(contacts.length>15);
  assert.ok(contacts.slice(1).every((t,i)=>t-contacts[i]>=.99 && t-contacts[i]<1.04));
  assert.equal(10000-hp.current,contacts.length*37);
  assert.deepEqual(world.getEntitiesWith(EnemyComponent),[boss]);
  assert.equal(world.getEntitiesWith(ProjectileComponent).length,0);
  assert.deepEqual(waves._generateWaveEnemies(10),['boss_scout']);
});

test('first boss defeats base offense but a damage build wins with basic range and health at x1/x3', () => {
  for (const speed of [1,3]) for (const damage of [25,115]) {
    const world = new World(); world.gameSpeed = speed;
    const hp = new HealthComponent(300,300,1);
    entity(world,new TowerComponent(),new TransformComponent(600,400),new CircleColliderComponent(26,1000,true),
      hp,new AttackComponent(damage,1.6,130,0,0,1.6,1,0,0),new TargetComponent(),new ArmorComponent());
    for (const system of [new MovementSystem(),new TargetingSystem(),new WeaponSystem(),new CollisionSystem(),new DamageSystem()]) world.registerSystem(system);
    const waves = new WaveSystem(); waves.stageId=1; waves.currentWave=10;
    const boss = waves._spawnEnemy(world,'boss_scout',{x:730,y:400});
    world.getComponent(boss,VelocityComponent).currentSpeed=50;
    const bossHp=world.getComponent(boss,HealthComponent);
    assert.equal(bossHp.max,755);
    for (let t=0;t<60 && !world.isGameOver && bossHp.current>0;t+=speed/60) world.update(1/60);
    if(damage===25) { assert.equal(hp.current,0); assert.ok(bossHp.current>0); }
    else { assert.equal(bossHp.current,0); assert.ok(hp.current>0); }
  }
});

test('Architect is one durable hull that marches straight to drill range without projectiles or satellites', () => {
  const world = new World(), waves = new WaveSystem(), damage = new DamageSystem();
  const towerHealth = new HealthComponent(10000, 10000);
  entity(world, new TowerComponent(), new TransformComponent(600, 400), new CircleColliderComponent(26, 1000, true), towerHealth);
  world.registerSystem(new MovementSystem()); world.registerSystem(new CollisionSystem()); world.registerSystem(damage);
  waves.currentWave = 10;
  const boss = waves._spawnEnemy(world, 'boss_architect');
  assert.deepEqual(world.getEntitiesWith(EnemyComponent), [boss]);
  const transform = world.getComponent(boss, TransformComponent), velocity = world.getComponent(boss, VelocityComponent);
  const health = world.getComponent(boss, HealthComponent), enemy = world.getComponent(boss, EnemyComponent);
  Object.assign(transform, { x: 900, y: 600 }); velocity.currentSpeed = GameConfig.enemies.boss_architect.baseSpeed;
  assert.equal(enemy.shieldIds, null); assert.equal(enemy.isSniper, false);
  damage._applyDamageToEntity(world, boss, 25, false);
  assert.equal(health.max, 943); assert.equal(health.current, 927); // 35% approach armor.
  const startDistance = Math.hypot(300, 200);
  for (let i = 0; i < 120; i++) world.update(1 / 60);
  assert.ok(Math.abs(Math.hypot(transform.x - 600, transform.y - 400) - (startDistance - 90)) < 1e-6);
  assert.ok(Math.abs((transform.x - 600) * 200 - (transform.y - 400) * 300) < 1e-6);
  assert.equal(towerHealth.current, 10000);
  for (let i = 0; i < 1000; i++) world.update(1 / 60);
  assert.ok(towerHealth.current < 10000);
  assert.equal(world.getEntitiesWith(ProjectileComponent).length, 0);
  assert.deepEqual(world.getEntitiesWith(EnemyComponent), [boss]);
});

test('spawned scouts die to one base noncritical hit on wave one, then need a second hit', () => {
  const world = new World();
  const waves = new WaveSystem();
  const damage = new DamageSystem();
  const expectedHp = [25, 28, 30, 33, 37, 40];
  const remainingHp = [0, 3, 5, 8, 12, 15];
  for (let wave = 1; wave <= 6; wave++) {
    waves.currentWave = wave;
    waves._spawnEnemy(world, 'scout');
    const target = world.getEntitiesWith(EnemyComponent)[0];
    const health = world.getComponent(target, HealthComponent);
    assert.equal(health.current, expectedHp[wave - 1]);
    damage._applyDamageToEntity(world, target, GameConfig.tower.baseDamage, false);
    assert.equal(health.current, remainingHp[wave - 1]);
    if (wave >= 2) damage._applyDamageToEntity(world, target, GameConfig.tower.baseDamage, false);
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
