import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { World } from '../src/core/World.js';
import { DevTools } from '../src/ui/DevTools.js';
import { DevControlComponent } from '../src/components/DevControlComponent.js';
import { TowerComponent } from '../src/components/TowerComponent.js';
import { HealthComponent } from '../src/components/HealthComponent.js';
import { TransformComponent } from '../src/components/TransformComponent.js';
import { CircleColliderComponent } from '../src/components/CircleColliderComponent.js';
import { ArmorComponent } from '../src/components/ArmorComponent.js';
import { EconomyComponent } from '../src/components/EconomyComponent.js';
import { AttackComponent } from '../src/components/AttackComponent.js';
import { TargetComponent } from '../src/components/TargetComponent.js';
import { EnemyComponent } from '../src/components/EnemyComponent.js';
import { ProjectileComponent } from '../src/components/ProjectileComponent.js';
import { WaveSystem } from '../src/systems/WaveSystem.js';
import { DamageSystem } from '../src/systems/DamageSystem.js';
import { WeaponSystem } from '../src/systems/WeaponSystem.js';
import { GameConfig } from '../src/config/GameConfig.js';
import { EN_TRANSLATIONS } from '../src/i18n/Translations.js';
import { UIManager } from '../src/ui/UIManager.js';

function add(world, ...components) {
  const id = world.createEntity();
  for (const component of components) world.addComponent(id, component);
  return id;
}
function setup() {
  const world = new World(), flags = new DevControlComponent(); flags.enabled = true;
  const health = new HealthComponent(170, 300), economy = new EconomyComponent(77);
  economy.runCrystals = 9;
  const tower = add(world, new TowerComponent(), new TransformComponent(600, 400), new CircleColliderComponent(26, 1000, true),
    health, economy, new ArmorComponent(), new AttackComponent(25, 1.6, 130), new TargetComponent(), flags);
  const waves = new WaveSystem(); waves.init(world);
  const ui = { updateHUD() {}, _updatePauseButton() {}, togglePause() { world.isPaused = !world.isPaused; } };
  const app = { world, waveSystem: waves, uiManager: ui, particleSystem: { reset() {} }, _resizeCanvas() {} };
  const dev = Object.create(DevTools.prototype);
  Object.assign(dev, { app, world, flags, desktop: { matches: true }, refresh() {} });
  return { world, tower, health, economy, flags, waves, dev };
}

test('dev invulnerability blocks actual damage and defeat; disabled controls and the master switch restore normal damage', () => {
  const { world, tower, health, flags } = setup(), damage = new DamageSystem();
  flags.invulnerable = true;
  damage._applyDamageToEntity(world, tower, 1000, false);
  assert.equal(health.current, 170); assert.equal(world.isGameOver, false);
  flags.enabled = false; damage._applyDamageToEntity(world, tower, 10, false);
  assert.equal(health.current, 160);
  const saved = GameConfig.devTools.enabled; GameConfig.devTools.enabled = false; flags.enabled = true;
  try { damage._applyDamageToEntity(world, tower, 10, false); assert.equal(health.current, 150); }
  finally { GameConfig.devTools.enabled = saved; }
});

test('tower-fire switch prevents projectiles without altering stats, and frozen waves keep queue/timers intact', () => {
  const { world, tower, flags, waves } = setup();
  const enemy = add(world, new EnemyComponent('scout'), new TransformComponent(660, 400), new HealthComponent(100, 100));
  world.getComponent(tower, TargetComponent).targetEntityId = enemy;
  flags.firingDisabled = true;
  new WeaponSystem().update(world, 1);
  assert.equal(world.getEntitiesWith(ProjectileComponent).length, 0);
  assert.equal(world.getComponent(tower, AttackComponent).damage, 25);
  flags.firingDisabled = false;
  new WeaponSystem().update(world, 1);
  assert.equal(world.getEntitiesWith(ProjectileComponent).length, 1);
  waves.startFirstWave(world); flags.wavesFrozen = true;
  const before = { queue: [...waves.spawnQueue], timer: waves.spawnTimer };
  waves.update(world, 10);
  assert.deepEqual(waves.spawnQueue, before.queue); assert.equal(waves.spawnTimer, before.timer);
  flags.enabled = false; waves.update(world, 1);
  assert.equal(waves.spawnQueue.length, before.queue.length - 1);
});

test('single stepping advances exactly 1/60 simulation seconds at each speed and always restores pause, including defeat/errors', () => {
  const { world, dev } = setup();
  let total = 0; world.registerSystem({ update(w, dt) { total += dt; } });
  for (const speed of [0.25, 0.5, 1, 2, 3]) {
    world.isPaused = true; assert.equal(dev.setSpeed(speed), true);
    assert.equal(world.isPaused, true);
    const before = total; assert.equal(dev.step(), true);
    assert.ok(Math.abs(total - before - 1 / 60) < 1e-10); assert.equal(world.isPaused, true);
  }
  assert.equal(dev.setSpeed(10), false);
  world.isPaused = false; assert.equal(dev.step(), false);
  world.isPaused = true;
  world.registerSystem({ update() { throw Error('step failure'); } });
  assert.throws(() => dev.step(), /step failure/); assert.equal(world.isPaused, true);
  world.systems.pop();
  world.registerSystem({ update(w) { w.isGameOver = true; w.isPaused = true; } });
  dev.step(); assert.equal(world.isGameOver, true); assert.equal(world.isPaused, true);
});

test('normal speed HUD displays dev slow motion precisely while preserving the regular speed format', () => {
  const world = new World(), ui = Object.create(UIManager.prototype);
  ui.world = world; ui.dom = { speedValue: {}, btnSpeedDown: {}, btnSpeedUp: {} };
  world.gameSpeed = 0.25; ui._updateSpeedControls(); assert.equal(ui.dom.speedValue.textContent, '0.25×');
  world.gameSpeed = 0.5; ui._updateSpeedControls(); assert.equal(ui.dom.speedValue.textContent, '0.5×');
  world.gameSpeed = 1; ui._updateSpeedControls(); assert.equal(ui.dom.speedValue.textContent, '1.0×');
});

test('healing, credits and wave jumps affect the current run without resetting upgrades or paying pending microchips', () => {
  const { world, tower, health, economy, dev, waves, flags } = setup();
  let creditsEvent = null, settled = 0;
  world.eventBus.on('CREDITS_CHANGED', event => { creditsEvent = event; });
  world.eventBus.on('RUN_CRYSTALS_SETTLED', () => settled++);
  assert.equal(dev.addCredits(1000), true); assert.equal(economy.credits, 1077);
  assert.equal(creditsEvent.credits, 1077); assert.equal(creditsEvent.source, 'devtools');
  dev.setHealth(1); assert.equal(health.current, 300);
  dev.setHealth(0.5); assert.equal(health.current, 150);
  const attack = world.getComponent(tower, AttackComponent); attack.damage = 88;
  waves._spawnEnemy(world, 'boss_architect'); add(world, new ProjectileComponent());
  flags.wavesFrozen = true; world.isPaused = true;
  assert.equal(dev.jumpWave(10), true);
  assert.equal(waves.currentWave, 10); assert.deepEqual(waves.spawnQueue, ['boss_architect']);
  assert.equal(flags.wavesFrozen, false); assert.equal(world.isPaused, true);
  assert.equal(world.getEntitiesWith(EnemyComponent).length, 0); assert.equal(world.getEntitiesWith(ProjectileComponent).length, 0);
  assert.equal(attack.damage, 88); assert.equal(health.current, 150); assert.equal(economy.runCrystals, 9);
  assert.equal(settled, 0); assert.equal(dev.jumpWave(NaN), false);
  dev.jumpWave(201); assert.equal(waves.currentWave, 200);
});

test('level jump dispatches a fresh run for valid levels only, without changing the wave-jump action',()=>{
  const {dev,world}=setup(),started=[];
  dev.app.restartGame=id=>started.push(id);dev.dom={stage:{value:'4'}};
  assert.equal(dev.execute('stage'),true);assert.deepEqual(started,[4]);
  for(const id of [0,9,1.5,NaN,Infinity,'4'])assert.equal(dev.jumpStage(id),false);
  assert.deepEqual(started,[4]);
  world.isGameOver=true;assert.equal(dev.jumpStage(2),false);
  world.isGameOver=false;dev.desktop.matches=false;assert.equal(dev.jumpStage(2),false);
});

test('manual spawn uses wave scaling and custom coordinates; Architect is a single hull without satellites', () => {
  const { world, dev, waves } = setup();
  let progress = null; world.eventBus.on('WAVE_PROGRESS', event => { progress = event; });
  waves.currentWave = 20;
  assert.equal(dev.spawn('boss_architect', 1, 300, '180'), true);
  const boss = world.getEntitiesWith(EnemyComponent).find(id => world.getComponent(id, EnemyComponent).type === 'boss_architect');
  const position = world.getComponent(boss, TransformComponent), comp = world.getComponent(boss, EnemyComponent);
  assert.equal(position.x, 300); assert.ok(Math.abs(position.y - 400) < 1e-9);
  assert.equal(world.getComponent(boss, HealthComponent).max, Math.round(GameConfig.enemies.boss_architect.baseHp * GameConfig.waves.hpScaleFactor ** 19));
  assert.equal(comp.shieldIds, null);
  assert.equal(world.getEntitiesWith(EnemyComponent).length, 1);
  assert.equal(progress.alive, 1); assert.equal(progress.total, 1); assert.equal(progress.spawned, 1);
  dev.spawn('scout', 3, 300, '0'); assert.equal(progress.alive, 4); assert.equal(progress.total, 4);
  assert.equal(dev.spawn('boss_shield', 1, 300, '0'), false);
  assert.equal(dev.spawn('fighter', NaN, 300, '0'), false);
});

test('spawning a Citadel while paused places all six attachments at the requested location immediately',()=>{
  const {world,dev}=setup();world.isPaused=true;
  assert.equal(dev.spawn('boss_citadel',1,300,'180'),true);
  const boss=world.getEntitiesWith(EnemyComponent).find(id=>world.getComponent(id,EnemyComponent).type==='boss_citadel');
  const position=world.getComponent(boss,TransformComponent);
  const modules=world.getEntitiesWith(EnemyComponent).filter(id=>world.getComponent(id,EnemyComponent).type==='citadel_generator');
  assert.equal(modules.length,6);
  for(const id of modules) {
    const point=world.getComponent(id,TransformComponent);
    assert.ok(Math.abs(Math.hypot(point.x-position.x,point.y-position.y)-GameConfig.enemies.boss_citadel.generatorOrbit)<1e-7);
  }
  assert.equal(dev._aliveCount(),7);
});

test('clearing the field removes bosses, segments, projectiles and pending spawns without kill/wave rewards', () => {
  const { world, dev, waves, flags, economy } = setup();
  waves.startFirstWave(world); dev.spawn('boss_architect', 1, 300, '0');
  add(world, new ProjectileComponent());
  const rewards = [];
  for (const name of ['ENTITY_DIED', 'WAVE_COMPLETED', 'RUN_CRYSTALS_SETTLED']) world.eventBus.on(name, () => rewards.push(name));
  dev.clearField();
  assert.equal(world.getEntitiesWith(EnemyComponent).length, 0); assert.equal(world.getEntitiesWith(ProjectileComponent).length, 0);
  assert.equal(waves.state, 'IDLE'); assert.equal(waves.spawnQueue.length, 0); assert.equal(flags.wavesFrozen, true);
  assert.deepEqual(rewards, []); assert.equal(economy.credits, 77); assert.equal(economy.runCrystals, 9);
});

test('AI presets create the requested groups, keep their wave stats, and enable observation switches', () => {
  const { world, dev, waves, flags } = setup();
  waves.currentWave = 10;
  dev.scenario('convoy');
  assert.deepEqual(world.getEntitiesWith(EnemyComponent).map(id => world.getComponent(id, EnemyComponent).type), ['tank', 'fighter', 'fighter', 'fighter']);
  assert.equal(flags.invulnerable && flags.firingDisabled && flags.wavesFrozen, true);
  assert.equal(waves.currentWave, 10);
  dev.scenario('bunker');
  assert.deepEqual(world.getEntitiesWith(EnemyComponent).map(id => world.getComponent(id, EnemyComponent).type), ['aegis', 'sniper', 'sniper']);
  assert.equal(waves.totalEnemiesInWave, 3); assert.equal(waves.enemiesSpawned, 3);
});

test('desktop, lifecycle and master-switch gates prevent hidden/mobile dev actions and deactivate ECS cheats', () => {
  const { dev, flags, world, economy } = setup();
  const classes = new Set(); let resizes = 0;
  dev.root = { classList: { toggle(name, force) { assert.equal(typeof force, 'boolean'); if (force) classes.add(name); else classes.delete(name); } } };
  dev.app._resizeCanvas = () => resizes++;
  dev._shown = false;
  dev._syncLayout(); assert.equal(flags.enabled, true); assert.equal(resizes, 1);
  dev._syncLayout(); assert.equal(resizes, 1);
  dev.desktop.matches = false; dev._syncLayout();
  assert.equal(flags.enabled, false); assert.equal(classes.has('devtools-mounted'), false);
  assert.equal(dev.addCredits(1000), false); assert.equal(dev.spawn('tank', 1, 300, '0'), false);
  dev.desktop.matches = true; world.inMenu = true; assert.equal(dev.jumpWave(10), false);
  world.inMenu = false; world.isGameOver = true; assert.equal(dev.setHealth(1), false);
  world.isGameOver = false;
  const enabled = GameConfig.devTools.enabled; GameConfig.devTools.enabled = false;
  try { dev._syncLayout(); assert.equal(dev.scenario('convoy'), false); assert.equal(flags.enabled, false); }
  finally { GameConfig.devTools.enabled = enabled; }
  assert.equal(economy.credits, 77);
});

test('all developer-panel Russian labels have English translations', async () => {
  const source = await readFile(new URL('../src/ui/DevTools.js', import.meta.url), 'utf8');
  const keys = [...source.matchAll(/'([^'\r\n]*[А-Яа-яЁё][^'\r\n]*)'/g)].map(match => match[1]);
  assert.ok(keys.length > 20);
  assert.deepEqual(keys.filter(key => !EN_TRANSLATIONS[key]), []);
});
