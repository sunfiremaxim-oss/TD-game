import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/core/World.js';
import { GameConfig } from '../src/config/GameConfig.js';
import { STAGES } from '../src/config/StageConfig.js';
import { CarrierComponent } from '../src/components/CarrierComponent.js';
import { FighterFlightComponent } from '../src/components/FighterFlightComponent.js';
import { TowerComponent } from '../src/components/TowerComponent.js';
import { TransformComponent } from '../src/components/TransformComponent.js';
import { CircleColliderComponent } from '../src/components/CircleColliderComponent.js';
import { AttackComponent } from '../src/components/AttackComponent.js';
import { TargetComponent } from '../src/components/TargetComponent.js';
import { HealthComponent } from '../src/components/HealthComponent.js';
import { ArmorComponent } from '../src/components/ArmorComponent.js';
import { DefenseComponent } from '../src/components/DefenseComponent.js';
import { EconomyComponent } from '../src/components/EconomyComponent.js';
import { EnemyComponent } from '../src/components/EnemyComponent.js';
import { ProjectileComponent } from '../src/components/ProjectileComponent.js';
import { CarrierAISystem } from '../src/systems/CarrierAISystem.js';
import { MovementSystem } from '../src/systems/MovementSystem.js';
import { PhysicsSeparationSystem } from '../src/systems/PhysicsSeparationSystem.js';
import { TargetingSystem } from '../src/systems/TargetingSystem.js';
import { WeaponSystem } from '../src/systems/WeaponSystem.js';
import { CollisionSystem } from '../src/systems/CollisionSystem.js';
import { DamageSystem } from '../src/systems/DamageSystem.js';
import { WaveSystem } from '../src/systems/WaveSystem.js';
import { EconomySystem } from '../src/systems/EconomySystem.js';
import { PlayerProgress } from '../src/managers/PlayerProgress.js';
import { getCarrierOrbitRadius } from '../src/combat/CarrierMechanics.js';
import { calculateMitigatedDamage, getExpectedInFlightDamage } from '../src/combat/DamageCalculation.js';
import { EnemyVisualCache } from '../src/visuals/BattleVisualCache.js';
import { RenderSystem } from '../src/systems/RenderSystem.js';

function scene(fire = false, hp = 10000, damage = 115) {
  const world = new World(), tower = world.createEntity(), health = new HealthComponent(hp, hp, 1), economy = new EconomyComponent();
  economy.crystalDropChance = 0;
  for (const c of [new TowerComponent(), new TransformComponent(600, 400), new CircleColliderComponent(26, 1000, true),
    new AttackComponent(damage, 1.6, 130, 0, 0, 1.6, 1, 0, 0), new TargetComponent(), health, economy, new ArmorComponent(), new DefenseComponent()]) world.addComponent(tower, c);
  const waves = new WaveSystem(), damageSystem = new DamageSystem();
  for (const s of [new CarrierAISystem(), new MovementSystem(), new PhysicsSeparationSystem(), new TargetingSystem(),
    ...(fire ? [new WeaponSystem()] : []), new CollisionSystem(), damageSystem, waves, new EconomySystem()]) world.registerSystem(s);
  waves.stageId = 2; waves.currentWave = 20; waves.state = 'ACTIVE'; waves.totalEnemiesInWave = waves.enemiesSpawned = 1;
  world.stageId = 2;
  const orbit = getCarrierOrbitRadius(26, GameConfig.enemies.boss_carrier.radius, 130);
  const boss = waves._spawnEnemy(world, 'boss_carrier', { x: 600 + orbit, y: 400 });
  const carrier = world.getComponent(boss, CarrierComponent), bossHp = world.getComponent(boss, HealthComponent);
  return { world, tower, health, economy, waves, damageSystem, boss, carrier, bossHp, orbit };
}
function advance(world, seconds, dt = 1 / 60) {
  for (let t = 0; t < seconds - 1e-9 && !world.isGameOver;) {
    const step = Math.min(dt, (seconds - t) / world.gameSpeed); world.update(step); t += step * world.gameSpeed;
  }
}
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);
const fighters = world => world.getEntitiesWith(EnemyComponent).filter(id => world.getComponent(id, EnemyComponent).type === 'fighter');

test('stage two has its own final boss with independent HP and projectile damage', () => {
  const run = scene();
  assert.equal(STAGES[0].boss, 'boss_scout'); assert.equal(STAGES[1].boss, 'boss_carrier');
  assert.equal(STAGES[2].boss, 'boss_architect');
  assert.deepEqual(run.waves._generateWaveEnemies(20), ['boss_carrier']);
  assert.equal(run.bossHp.max, 1682); assert.equal(run.world.getComponent(run.boss, EnemyComponent).damage, 33);
  const before = GameConfig.enemies.boss_architect.baseHp;
  try {
    GameConfig.enemies.boss_architect.baseHp = 123456;
    const id = run.waves._spawnEnemy(run.world, 'boss_carrier');
    assert.equal(run.world.getComponent(id, HealthComponent).max, 1682);
  } finally { GameConfig.enemies.boss_architect.baseHp = before; }
});

test('warning precedes a two-sided lighter fighter launch, and the wave HUD counts the new enemies', () => {
  const run = scene(), births = [], progress = [];
  run.world.eventBus.on('ENEMY_SPAWNED', e => { if (e.type === 'fighter') births.push(e); });
  run.world.eventBus.on('WAVE_PROGRESS', e => progress.push(e));
  advance(run.world, 1.1); assert.equal(run.carrier.phase, 'launch'); assert.equal(fighters(run.world).length, 0);
  advance(run.world, .15); assert.equal(run.carrier.phase, 'exposed'); assert.equal(run.carrier.launches, 1);
  assert.equal(fighters(run.world).length, 2); assert.equal(run.waves.totalEnemiesInWave, 3);
  assert.equal(progress.at(-1).alive, 3);
  assert.deepEqual(births.map(e => [e.hp, e.damage]), [[110, 37], [110, 37]]);
  assert.deepEqual(fighters(run.world).map(id => run.world.getComponent(id, FighterFlightComponent).direction), [-1, 1]);
  const count = fighters(run.world).length; run.world.eventBus.emit('CARRIER_LAUNCH', { carrierId: run.boss });
  assert.equal(fighters(run.world).length, count, 'the same launch cannot be replayed');
});

test('a long battle launches at most six fighters and leaves the reactor permanently exposed', () => {
  const run = scene(false, 1e6); let spawned = 0;
  run.world.eventBus.on('ENEMY_SPAWNED', e => { if (e.type === 'fighter') spawned++; });
  advance(run.world, 60);
  assert.equal(spawned, 6); assert.equal(run.carrier.launches, 3);
  assert.equal(run.carrier.phase, 'exposed'); assert.equal(run.carrier.phaseRemaining, Infinity);
  advance(run.world, 60); assert.equal(spawned, 6);
});

test('phase timers freeze on pause and knockback, while x3 preserves the same launch schedule', () => {
  for (const speed of [1, 3]) {
    const run = scene(); run.world.gameSpeed = speed;
    advance(run.world, .6); const state = JSON.stringify(run.carrier);
    run.world.isPaused = true; run.world.update(10); assert.equal(JSON.stringify(run.carrier), state);
    run.world.isPaused = false; advance(run.world, .65);
    assert.equal(run.carrier.launches, 1); assert.equal(run.carrier.phase, 'exposed');
    const enemy = run.world.getComponent(run.boss, EnemyComponent), elapsed = run.carrier.elapsed;
    enemy.knockbackRemaining = 1; run.world.update(.1 / speed); near(run.carrier.elapsed, elapsed);
  }
});

test('carrier stays on an orbit inside attack range and adapts when range is upgraded', () => {
  const run = scene(false, 1e6), initial = run.world.getComponent(run.boss, TransformComponent);
  advance(run.world, 4); assert.ok(Math.abs(initial.y - 400) > 20);
  assert.ok(Math.abs(Math.hypot(initial.x - 600, initial.y - 400) - run.orbit) < .1);
  run.world.getComponent(run.tower, AttackComponent).range = 250;
  advance(run.world, 5);
  assert.ok(Math.abs(Math.hypot(initial.x - 600, initial.y - 400) - 210) < .1);
});

test('damage prediction and actual hits both respect closed armor and the exposed core', () => {
  const run = scene();
  assert.equal(calculateMitigatedDamage(run.world, run.boss, 100), 80);
  const bullet = run.world.createEntity();
  run.world.addComponent(bullet, new ProjectileComponent(run.tower, run.boss, 0, 2.5, 100));
  for (const [phase, expected] of [['launch', 80], ['exposed', 140], ['reload', 80]]) {
    run.carrier.phase = phase;
    assert.equal(getExpectedInFlightDamage(run.world).get(run.boss), expected);
    const before = run.bossHp.current;
    run.world.eventBus.emit('PROJECTILE_HIT', { sourceId: run.tower, targetId: run.boss, damage: 100 });
    assert.equal(before - run.bossHp.current, expected);
  }
});

test('projectiles inflict the carrier damage, and forced body overlap never adds a contact attack', () => {
  const run = scene();
  Object.assign(run.world.getComponent(run.boss, TransformComponent), { x: 600, y: 400 });
  let contacts = 0; const shots = [];
  run.world.eventBus.on('TOWER_CONTACT', e => { if (e.enemyId === run.boss) contacts++; });
  run.world.eventBus.on('TOWER_HIT', e => { if (e.sourceId === run.boss) shots.push(e.damage); });
  new CollisionSystem().update(run.world, 1); assert.equal(contacts, 0);
  const position = run.world.getComponent(run.boss, TransformComponent); position.x = 600 + run.orbit;
  advance(run.world, 4);
  assert.ok(run.health.current < 10000); assert.equal(contacts, 0); assert.deepEqual(shots, [33]);
});

test('carrier death stops launches, and stage victory waits for surviving fighters before paying once', () => {
  const run = scene(), progress = new PlayerProgress(null); progress.credit(0, 1); progress.init(run.world);
  advance(run.world, 1.3); assert.equal(fighters(run.world).length, 2);
  let wins = 0, payments = 0;
  run.world.eventBus.on('STAGE_COMPLETED', () => wins++);
  run.world.eventBus.on('RUN_CRYSTALS_SETTLED', () => payments++);
  run.damageSystem._applyDamageToEntity(run.world, run.boss, 1e6, false);
  run.world.update(1 / 60); assert.equal(run.world.isGameOver, false);
  advance(run.world, 5); assert.equal(fighters(run.world).length, 2);
  for (const id of fighters(run.world)) run.damageSystem._applyDamageToEntity(run.world, id, 1e6, false);
  run.world.update(1 / 60); run.world.update(1 / 60);
  assert.equal(run.world.runOutcome, 'victory'); assert.equal(progress.completedStages, 2);
  assert.equal(progress.crystals, 21); assert.equal(wins, 1); assert.equal(payments, 1);
});

test('a queued carrier cannot shoot or spawn, and 115 damage with base HP can win its final encounter', () => {
  const removed = scene(); removed.world.destroyEntity(removed.boss); advance(removed.world, 1);
  assert.equal(fighters(removed.world).length, 0); assert.equal(removed.world.getEntitiesWith(ProjectileComponent).length, 0);
  const run = scene(true, 300, 115); advance(run.world, 60);
  assert.equal(run.world.runOutcome, 'victory'); assert.ok(run.health.current > 0);
});

function context() {
  const calls = [], stack = [];
  const ctx = { calls, globalAlpha: 1, shadowBlur: 0,
    save() { stack.push({ globalAlpha: this.globalAlpha, shadowBlur: this.shadowBlur }); },
    restore() { Object.assign(this, stack.pop()); }, drawImage() { calls.push('image'); } };
  return new Proxy(ctx, { get: (obj, key) => obj[key] ?? (() => calls.push(key)),
    set(obj, key, value) { if (key === 'shadowBlur' && value > 0) calls.push('blur'); obj[key] = value; return true; } });
}
test('all three carrier visual states share at most six cached sprites and draw without live geometry', () => {
  const canvases = [], output = context(), renderer = Object.create(RenderSystem.prototype);
  const cache = new EnemyVisualCache(() => { const c = { getContext: () => context() }; canvases.push(c); return c; });
  for (const phase of ['closed', 'launch', 'exposed']) cache.draw(output, renderer, 'boss_carrier', GameConfig.enemies.boss_carrier, .75, 1, phase);
  assert.equal(canvases.length, 6); output.calls.length = 0;
  for (let i = 0; i < 600; i++) cache.draw(output, renderer, 'boss_carrier', GameConfig.enemies.boss_carrier, .75, 1, ['closed', 'launch', 'exposed'][i % 3]);
  assert.equal(canvases.length, 6); assert.equal(output.calls.filter(c => c === 'image').length, 1200);
  assert.equal(output.calls.some(c => ['blur', 'stroke', 'fill', 'beginPath', 'createLinearGradient'].includes(c)), false);
  assert.ok(canvases.reduce((sum, c) => sum + c.width * c.height * 4, 0) < 2 * 1024 * 1024);
});
