import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/core/World.js';
import { GameConfig } from '../src/config/GameConfig.js';
import { ArchitectDrillComponent } from '../src/components/ArchitectDrillComponent.js';
import { ArchitectSiegeComponent } from '../src/components/ArchitectSiegeComponent.js';
import { TransformComponent } from '../src/components/TransformComponent.js';
import { VelocityComponent } from '../src/components/VelocityComponent.js';
import { HealthComponent } from '../src/components/HealthComponent.js';
import { TowerComponent } from '../src/components/TowerComponent.js';
import { CircleColliderComponent } from '../src/components/CircleColliderComponent.js';
import { ArmorComponent } from '../src/components/ArmorComponent.js';
import { DefenseComponent } from '../src/components/DefenseComponent.js';
import { EnemyComponent } from '../src/components/EnemyComponent.js';
import { WaveSystem } from '../src/systems/WaveSystem.js';
import { MovementSystem } from '../src/systems/MovementSystem.js';
import { PhysicsSeparationSystem } from '../src/systems/PhysicsSeparationSystem.js';
import { CollisionSystem } from '../src/systems/CollisionSystem.js';
import { DamageSystem } from '../src/systems/DamageSystem.js';
import { ParticleSystem } from '../src/systems/ParticleSystem.js';
import { RenderSystem } from '../src/systems/RenderSystem.js';
import { ArchitectDrillVisual } from '../src/visuals/ArchitectDrillVisual.js';

function setup() {
  const world = new World(), tower = world.createEntity(), health = new HealthComponent(10000, 10000);
  const armor = new ArmorComponent(), defense = new DefenseComponent();
  for (const c of [new TowerComponent(), new TransformComponent(600, 400), new CircleColliderComponent(26, 1000, true), health, armor, defense]) world.addComponent(tower, c);
  world.registerSystem(new MovementSystem()); world.registerSystem(new PhysicsSeparationSystem());
  world.registerSystem(new CollisionSystem()); world.registerSystem(new DamageSystem());
  const waves = new WaveSystem();
  const boss = waves._spawnEnemy(world, 'boss_architect');
  // These tests isolate the continuous drill primitive; siege timing has its
  // own integration suite, including the exact same damage/visual pipeline.
  world.removeComponent(boss, ArchitectSiegeComponent);
  const position = world.getComponent(boss, TransformComponent), velocity = world.getComponent(boss, VelocityComponent);
  const drill = world.getComponent(boss, ArchitectDrillComponent), bossHealth = world.getComponent(boss, HealthComponent);
  const reach = 26 + GameConfig.enemies.boss_architect.radius + GameConfig.enemies.boss_architect.drillGap;
  Object.assign(position, { x: 600 + reach, y: 400, rotation: Math.PI / 4 }); velocity.currentSpeed = GameConfig.enemies.boss_architect.baseSpeed;
  return { world, tower, health, armor, defense, waves, boss, position, velocity, drill, bossHealth, reach };
}
function advance(world, seconds, dt = 1 / 60) {
  const duration = seconds / world.gameSpeed;
  for (let elapsed = 0; elapsed < duration - 1e-10;) {
    const step = Math.min(dt, duration - elapsed); world.update(step); elapsed += step;
  }
}
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);

test('Architect is 1.5 times larger and faster, stops with a gap and never overshoots at x3', () => {
  const { world, position, velocity, drill, health, reach } = setup();
  assert.equal(GameConfig.enemies.boss_architect.radius, 44 * 1.5);
  assert.equal(GameConfig.enemies.boss_architect.baseSpeed, 30 * 1.5);
  position.x = 900; world.gameSpeed = 3;
  const initialRotation = position.rotation;
  world.update(.1); near(position.x, 900 - 13.5); assert.equal(drill.active, false); assert.equal(health.current, 10000);
  near(Math.abs(position.rotation - initialRotation), .12 * 1.7 * .3);
  advance(world, 9, .1);
  near(position.x, 600 + reach); near(velocity.vx, 0); assert.equal(drill.active, true);
  // Resizes or physics may push the boss too close: move back to its firing gap.
  position.x = 695; advance(world, 1, .1); near(position.x, 600 + reach);
});

for (const speed of [1, 3]) for (const dt of [1 / 320, 1 / 60, .1]) {
  test(`drill deals exactly one second of DPS in 20 small ticks at x${speed}, frame ${dt}`, () => {
    const { world, health, drill } = setup(); world.gameSpeed = speed;
    const hits = []; world.eventBus.on('DAMAGE_DEALT', e => { if (e.isTower) hits.push(e); });
    advance(world, 1, dt);
    near(10000 - health.current, 20); near(drill.elapsed, 1); assert.equal(hits.length, 20);
    assert.ok(hits.every(hit => hit.isContinuous && hit.damageKind === 'drill' && hit.netDamage === 1));
  });
}

test('flat armor, percentage armor and minimum damage apply to DPS, not to every tiny tick', () => {
  const { world, health, armor } = setup();
  armor.flatReduction = 10; armor.percentReduction = .2;
  advance(world, 1); near(10000 - health.current, 8);
  armor.flatReduction = 10000; armor.percentReduction = 2;
  const before = health.current; advance(world, 1); near(before - health.current, 1);
});

test('pause freezes the beam and damage; knockback, range loss and source death stop the drill', () => {
  const { world, health, drill, boss, position } = setup();
  advance(world, .2); assert.equal(drill.active, true); const hp = health.current, elapsed = drill.elapsed;
  world.isPaused = true; world.update(1); near(health.current, hp); near(drill.elapsed, elapsed);
  world.isPaused = false;
  const enemy = world.getComponent(boss, EnemyComponent);
  Object.assign(enemy, { knockbackRemaining: .2, knockbackVx: 100, knockbackVy: 0 });
  world.update(.1); assert.equal(drill.active, false); near(health.current, hp);
  enemy.knockbackRemaining = 0; position.x = 950; world.update(.05);
  assert.equal(drill.active, false); near(health.current, hp);
  world.destroyEntity(boss); world._flushDestructionQueue();
  world.eventBus.emit('TOWER_DRILL', { enemyId: boss, seconds: .05 }); near(health.current, hp);
});

test('forced overlap cannot add a contact hit, and reflection retains its per-second effectiveness', () => {
  const { world, health, defense, bossHealth, position } = setup();
  position.x = 692; defense.damageReflection = .2;
  let contacts = 0; world.eventBus.on('TOWER_CONTACT', () => contacts++);
  advance(world, 2);
  const before = health.current, bossBefore = bossHealth.current;
  advance(world, 1);
  near(before - health.current, 20); near(bossBefore - bossHealth.current, 4); assert.equal(contacts, 0);
});

for (const bearing of [0, Math.PI / 4, Math.PI, -Math.PI + .01, 1.23]) for (const speed of [1, 3]) {
  test(`Architect settles the nearest plate joint before firing, then holds it: bearing ${bearing}, x${speed}`, () => {
    const { world, boss, position, reach, drill, health } = setup();
    world.gameSpeed = speed;
    position.x = 600 - Math.cos(bearing) * reach;
    position.y = 400 - Math.sin(bearing) * reach;
    const initial = position.rotation = bearing - Math.PI * .75 + .6;
    world.update(.01);
    const rotationSpeed = Math.abs(world.getComponent(boss, EnemyComponent).rotationSpeed);
    near(rotationSpeed, .12 * 1.7);
    near(position.rotation, initial - rotationSpeed * .01 * speed);
    assert.equal(drill.aimReady, false); assert.equal(drill.active, false); near(health.current, 10000);
    advance(world, .6 / rotationSpeed);
    near(position.rotation, bearing - Math.PI * .75);
    assert.equal(drill.aimReady, true); assert.equal(drill.active, true);
    const locked = position.rotation, before = health.current;
    advance(world, 2); near(position.rotation, locked); near(before - health.current, 40);
    // A changed tower bearing requires another short alignment, without an angle jump.
    position.x = 600 - Math.cos(bearing + .3) * reach;
    position.y = 400 - Math.sin(bearing + .3) * reach;
    world.update(.01);
    near(position.rotation, locked + rotationSpeed * .01 * speed); assert.equal(drill.active, false);
    advance(world, .3 / rotationSpeed); near(position.rotation, locked + .3); assert.equal(drill.active, true);
  });
}

test('a reflecting kill finishes the stage once and stops remaining ticks; tower defeat also stops the beam', () => {
  const run = setup(); run.world.registerSystem(run.waves);
  run.waves.startFirstWave(run.world, 1); run.waves.currentWave = 10; run.waves._startWave(run.world);
  run.waves.spawnQueue.length = 0; run.bossHealth.current = .25; run.defense.damageReflection = .5;
  let wins = 0; run.world.eventBus.on('STAGE_COMPLETED', () => wins++);
  run.world.update(.3);
  near(10000 - run.health.current, 1); assert.equal(wins, 1); assert.equal(run.drill.active, false);
  assert.equal(run.world.runOutcome, 'victory');
  const lost = setup(); lost.health.current = .5;
  const reportedHp = []; lost.world.eventBus.on('TOWER_DAMAGED', e => reportedHp.push(e.currentHp));
  lost.world.update(.3); assert.deepEqual(reportedHp, [0]);
  assert.equal(lost.health.current, 0); assert.equal(lost.world.isGameOver, true); assert.equal(lost.drill.active, false);
});

test('drill and reflected ticks do not generate repeated hit particles', () => {
  const { world, defense } = setup(); defense.damageReflection = .2;
  const particles = new ParticleSystem(); world.registerSystem(particles);
  advance(world, 2); assert.equal(particles.particles.length, 0); assert.equal(particles.floatingTexts.length, 0);
});

function canvasContext() {
  const calls = [], stack = [];
  const state = { calls, globalAlpha: .8, globalCompositeOperation: 'source-over', shadowBlur: 0,
    save() { stack.push({ globalAlpha: this.globalAlpha, globalCompositeOperation: this.globalCompositeOperation, shadowBlur: this.shadowBlur }); },
    restore() { Object.assign(this, stack.pop()); },
    drawImage(...args) { calls.push(['image', ...args]); },
    createLinearGradient() { calls.push(['gradient']); return { addColorStop() {} }; },
    createRadialGradient() { calls.push(['gradient']); return { addColorStop() {} }; } };
  return new Proxy(state, { get: (target, key) => target[key] ?? ((...args) => calls.push([key, ...args])),
    set(target, key, value) { if (key === 'shadowBlur' && value > 0) calls.push(['live-blur']); target[key] = value; return true; } });
}

test('drill animation shares three bounded textures and paints only five blits per frame', () => {
  const canvases = [], ctx = canvasContext();
  const visual = new ArchitectDrillVisual(() => { const c = { getContext: () => canvasContext() }; canvases.push(c); return c; });
  visual.draw(ctx, 20, 30, 0, 35, 0); ctx.calls.length = 0;
  for (let i = 0; i < 600; i++) visual.draw(ctx, 20, 30, 1, 35 + i % 5, i / 60);
  assert.equal(canvases.length, 3); assert.ok(canvases.reduce((sum, c) => sum + c.width * c.height * 4, 0) < 1024 * 1024);
  assert.equal(ctx.calls.filter(call => call[0] === 'image').length, 3000);
  assert.equal(ctx.calls.some(call => ['gradient','live-blur','stroke','fillRect','beginPath'].includes(call[0])), false);
  assert.equal(ctx.globalAlpha, .8); assert.equal(ctx.globalCompositeOperation, 'source-over');
});

for (const bearing of [0, Math.PI / 4, Math.PI / 2, Math.PI, -2.1]) test(`twin drills emerge inside adjacent plate recesses and leave the barrel corridor clear: ${bearing}`, () => {
  const { world, drill, boss, position, reach } = setup();
  const nx = Math.cos(bearing), ny = Math.sin(bearing);
  Object.assign(position, { x: 600 - nx * reach, y: 400 - ny * reach, rotation: bearing - Math.PI / 4 });
  advance(world, .1);
  const renderer = Object.create(RenderSystem.prototype), draws = [];
  renderer.architectDrillVisual = { draw(...args) { draws.push(args); } };
  const state = JSON.stringify(drill);
  renderer._drawArchitectDrills({}, world);
  assert.equal(draws.length, 2);
  for (let i = 0; i < 2; i++) {
    const side = i ? 1 : -1;
    const [, x, y, angle, length, elapsed] = draws[i];
    const localX = (x - position.x) * Math.cos(-position.rotation) - (y - position.y) * Math.sin(-position.rotation);
    const localY = (x - position.x) * Math.sin(-position.rotation) + (y - position.y) * Math.cos(-position.rotation);
    // The +X/+Y plate joint faces the tower; both muzzles sit inside their
    // respective broad-face recess, rather than at the shared corner.
    near(localX, i === 0 ? 66 * .8 : 0); near(localY, i === 1 ? 66 * .8 : 0);
    const endX = x + Math.cos(angle) * length, endY = y + Math.sin(angle) * length;
    near(Math.hypot(endX - 600, endY - 400), 26); near(elapsed, .1);
    const startSide = (x - 600) * -ny + (y - 400) * nx;
    const endSide = (endX - 600) * -ny + (endY - 400) * nx;
    near(startSide, side * 66 * .8 / Math.SQRT2); near(endSide, side * 26 * .8);
    assert.ok(Math.min(Math.abs(startSide), Math.abs(endSide)) - 12 > 5, 'beam and impact glow must clear the barrel');
  }
  world.isPaused = true; renderer._drawArchitectDrills({}, world);
  assert.deepEqual(draws.slice(2), draws.slice(0, 2));
  assert.equal(JSON.stringify(drill), state);
  world.destroyEntity(boss); renderer._drawArchitectDrills({}, world); assert.equal(draws.length, 4);
});
