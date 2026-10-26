import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/core/World.js';
import { WaveSystem } from '../src/systems/WaveSystem.js';
import { MovementSystem } from '../src/systems/MovementSystem.js';
import { CollisionSystem } from '../src/systems/CollisionSystem.js';
import { DamageSystem } from '../src/systems/DamageSystem.js';
import { EconomySystem } from '../src/systems/EconomySystem.js';
import { PlayerProgress } from '../src/managers/PlayerProgress.js';
import { TowerComponent } from '../src/components/TowerComponent.js';
import { TransformComponent } from '../src/components/TransformComponent.js';
import { CircleColliderComponent } from '../src/components/CircleColliderComponent.js';
import { HealthComponent } from '../src/components/HealthComponent.js';
import { DefenseComponent } from '../src/components/DefenseComponent.js';
import { EnemyComponent } from '../src/components/EnemyComponent.js';
import { EconomyComponent } from '../src/components/EconomyComponent.js';
import { ProjectileComponent } from '../src/components/ProjectileComponent.js';
import { ArchitectDrillComponent } from '../src/components/ArchitectDrillComponent.js';
import { ArchitectSiegeComponent } from '../src/components/ArchitectSiegeComponent.js';
import { calculateMitigatedDamage, getExpectedInFlightDamage } from '../src/combat/DamageCalculation.js';
import { EnemyVisualCache } from '../src/visuals/BattleVisualCache.js';
import { RenderSystem } from '../src/systems/RenderSystem.js';
import { GameConfig } from '../src/config/GameConfig.js';
import { getArchitectArmorOpen } from '../src/visuals/ArchitectVisual.js';

function scene() {
  const world = new World(), tower = world.createEntity(), health = new HealthComponent(10000, 10000);
  const defense = new DefenseComponent(), economy = new EconomyComponent(); economy.crystalDropChance = 0;
  for (const component of [new TowerComponent(), new TransformComponent(600, 400), new CircleColliderComponent(26, 1000, true),
    health, defense, economy]) world.addComponent(tower, component);
  const waves = new WaveSystem(), collisions = new CollisionSystem();
  for (const s of [new MovementSystem(), collisions, new DamageSystem(), waves, new EconomySystem()]) world.registerSystem(s);
  waves.stageId = world.stageId = 3; waves.currentWave = 20; waves.state = 'ACTIVE';
  waves.totalEnemiesInWave = waves.enemiesSpawned = 1;
  const boss = waves._spawnEnemy(world, 'boss_architect', { x: 718, y: 400, rotation: Math.PI / 4 });
  return { world, tower, health, defense, economy, waves, collisions, boss,
    siege: world.getComponent(boss, ArchitectSiegeComponent), drill: world.getComponent(boss, ArchitectDrillComponent),
    bossHealth: world.getComponent(boss, HealthComponent) };
}
function advance(world, seconds, dt = 1 / 60) {
  for (let time = 0; time < seconds - 1e-9 && !world.isGameOver;) {
    const step = Math.min(dt, (seconds - time) / world.gameSpeed);
    world.update(step); time += step * world.gameSpeed;
  }
}
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);

test('third-stage finale is one Architect, never escorted by fighters or summoned reinforcements', () => {
  const run = scene();
  assert.deepEqual(run.waves._generateWaveEnemies(20), ['boss_architect']);
  assert.equal(run.bossHealth.max, 3822);
  assert.equal(run.world.getComponent(run.boss, EnemyComponent).damage, 96);
  advance(run.world, 30);
  assert.deepEqual(run.world.getEntitiesWith(EnemyComponent), [run.boss]);
  assert.equal(run.world.getEntitiesWith(ProjectileComponent).length, 0);
});

test('warning precedes drilling, cooling stops damage completely and the next attack is warned again', () => {
  const run = scene();
  advance(run.world, 1.19); near(run.health.current, 10000); assert.equal(run.drill.active, false);
  assert.equal(run.siege.phase, 'windup');
  advance(run.world, .01); assert.equal(run.siege.phase, 'drilling'); near(run.health.current, 10000);
  advance(run.world, 4); near(run.health.current, 9616);
  assert.equal(run.siege.phase, 'overheated'); assert.equal(run.drill.active, false);
  advance(run.world, 2.5); near(run.health.current, 9616); assert.equal(run.siege.phase, 'windup');
  advance(run.world, 1.19); near(run.health.current, 9616);
  advance(run.world, .06); near(run.health.current, 9611.2);
});

for (const speed of [1, 3]) for (const dt of [1 / 320, 1 / 60, .1]) {
  test(`two complete siege cycles preserve their exact damage at x${speed}, frame ${dt}`, () => {
    const run = scene(); run.world.gameSpeed = speed;
    advance(run.world, 15.4, dt);
    near(10000 - run.health.current, 768);
    assert.equal(run.siege.cycles, 2); assert.equal(run.siege.phase, 'windup');
    near(run.siege.phaseRemaining, 1.2); assert.equal(run.drill.active, false);
  });
}

test('a large frame splits warning, damage and cooling rather than applying DPS for the entire frame', () => {
  const run = scene(); run.world.update(6);
  near(10000 - run.health.current, 384); assert.equal(run.siege.phase, 'overheated');
  near(run.siege.phaseRemaining, 1.7); assert.equal(run.drill.active, false);
});

test('actual hits and in-flight prediction share approach armor and overheating vulnerability', () => {
  const run = scene(), bullet = run.world.createEntity();
  run.world.addComponent(bullet, new ProjectileComponent(run.tower, run.boss, 0, 10, 100));
  for (const [phase, damage] of [['approach', 65], ['windup', 65], ['drilling', 100], ['overheated', 150]]) {
    run.siege.phase = phase;
    assert.equal(calculateMitigatedDamage(run.world, run.boss, 100), damage);
    assert.equal(getExpectedInFlightDamage(run.world).get(run.boss), damage);
    const before = run.bossHealth.current;
    run.world.eventBus.emit('PROJECTILE_HIT', { sourceId: run.tower, targetId: run.boss, damage: 100 });
    assert.equal(before - run.bossHealth.current, damage);
  }
});

test('pause and knockback freeze the cycle; source removal leaves no damaging drill behind', () => {
  const run = scene(); advance(run.world, 2);
  const timer = run.siege.phaseRemaining, hp = run.health.current;
  run.world.isPaused = true; run.world.update(20); near(run.siege.phaseRemaining, timer); near(run.health.current, hp);
  run.world.isPaused = false;
  const enemy = run.world.getComponent(run.boss, EnemyComponent);
  Object.assign(enemy, { knockbackRemaining: .2, knockbackVx: 100, knockbackVy: 0 });
  run.world.update(.1); near(run.siege.phaseRemaining, timer); near(run.health.current, hp);
  assert.equal(run.drill.active, false);
  run.world.destroyEntity(run.boss); run.world.update(.1);
  run.world.eventBus.emit('TOWER_DRILL', { enemyId: run.boss, seconds: 1 });
  near(run.health.current, hp);
});

test('a reflecting kill during drilling stops remaining ticks and pays stage-three victory exactly once', () => {
  const run = scene(), progress = new PlayerProgress(null);
  progress.credit(0, 1); progress.credit(0, 2); progress.init(run.world);
  let wins = 0, payments = 0;
  run.world.eventBus.on('STAGE_COMPLETED', () => wins++);
  run.world.eventBus.on('RUN_CRYSTALS_SETTLED', () => payments++);
  advance(run.world, 1.2); run.bossHealth.current = .1; run.defense.damageReflection = 1;
  run.world.update(.3);
  near(10000 - run.health.current, 4.8); assert.equal(run.drill.active, false);
  assert.equal(run.world.runOutcome, 'victory'); assert.equal(progress.completedStages, 3);
  assert.equal(progress.crystals, 21); assert.equal(wins, 1); assert.equal(payments, 1);
  run.world.update(30); assert.equal(payments, 1);
});

function context() {
  const calls = [], stack = [], ctx = { calls, globalAlpha: 1, shadowBlur: 0,
    save() { stack.push({ globalAlpha: this.globalAlpha, shadowBlur: this.shadowBlur }); },
    restore() { Object.assign(this, stack.pop()); }, drawImage() { calls.push('image'); } };
  return new Proxy(ctx, { get: (obj, key) => obj[key] ?? (() => calls.push(key)),
    set(obj, key, value) { if (key === 'shadowBlur' && value > 0) calls.push('blur'); obj[key] = value; return true; } });
}

test('four siege appearances use bounded body/core sprites without live geometry or glow', () => {
  const canvases = [], ctx = context(), renderer = Object.assign(Object.create(RenderSystem.prototype), { corePulseAngle: 0 });
  const cache = new EnemyVisualCache(() => { const c = { getContext: () => context() }; canvases.push(c); return c; });
  const phases = ['armored', 'windup', 'drilling', 'overheated'];
  for (const phase of phases) cache.draw(ctx, renderer, 'boss_architect', GameConfig.enemies.boss_architect, .75, 1, phase);
  assert.equal(canvases.length, 24); ctx.calls.length = 0;
  for (let frame = 0; frame < 600; frame++) {
    renderer.corePulseAngle += .01;
    cache.draw(ctx, renderer, 'boss_architect', GameConfig.enemies.boss_architect, .75, 1, phases[frame % 4], (frame % 120) / 119);
  }
  assert.equal(canvases.length, 24); assert.equal(ctx.calls.filter(c => c === 'image').length, 7200);
  assert.equal(ctx.calls.some(c => ['stroke','fill','beginPath','blur'].includes(c)), false);
  assert.ok(canvases.reduce((sum, c) => sum + c.width * c.height * 4, 0) < 4 * 1024 * 1024);
});

test('armor opens and closes smoothly from simulation time, staying frozen on pause and knockback', () => {
  const run = scene(), cfg = GameConfig.enemies.boss_architect;
  const open = () => getArchitectArmorOpen(run.siege, cfg);
  advance(run.world, 1.2); near(open(), 0);
  advance(run.world, 4); near(open(), 0);
  advance(run.world, .16); near(open(), .5);
  const timer = run.siege.phaseRemaining;
  run.world.isPaused = true; run.world.update(10); near(open(), .5); near(run.siege.phaseRemaining, timer);
  run.world.isPaused = false;
  Object.assign(run.world.getComponent(run.boss, EnemyComponent), { knockbackRemaining: .1, knockbackVx: 0, knockbackVy: 0 });
  run.world.update(.05); near(open(), .5);
  run.world.getComponent(run.boss, EnemyComponent).knockbackRemaining = 0;
  advance(run.world, .16); near(open(), 1);
  advance(run.world, 2.18); near(open(), 1); assert.equal(run.siege.phase, 'windup');
  advance(run.world, .14); near(open(), .5);
  advance(run.world, .14); near(open(), 0);
  assert.equal(run.drill.active, false);
});

test('Aegis attenuates the assembled moving hull once without accumulating opacity or allocating animation buffers', () => {
  const canvases = [], ctx = context(), renderer = Object.assign(Object.create(RenderSystem.prototype), { corePulseAngle: 0 });
  ctx.globalAlpha = .75;
  const cache = new EnemyVisualCache(() => {
    const painter = context(), canvas = { getContext: () => painter }; canvases.push(canvas); return canvas;
  });
  cache.draw(ctx, renderer, 'boss_architect', GameConfig.enemies.boss_architect, .75, 1, 'overheated', 0);
  assert.equal(canvases.length, 7); ctx.calls.length = 0;
  for (let frame = 0; frame < 120; frame++) {
    cache.draw(ctx, renderer, 'boss_architect', GameConfig.enemies.boss_architect, .75, 1, 'overheated', frame / 119);
  }
  assert.equal(canvases.length, 7);
  assert.equal(ctx.calls.filter(c => c === 'image').length, 120);
  assert.equal(ctx.globalAlpha, .75);
  assert.ok(cache.architectLayer.canvas.width <= 384);
});
