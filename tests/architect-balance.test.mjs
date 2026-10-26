import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/core/World.js';
import { GameConfig } from '../src/config/GameConfig.js';
import { UpgradeManager } from '../src/managers/UpgradeManager.js';
import { WaveSystem } from '../src/systems/WaveSystem.js';
import { MovementSystem } from '../src/systems/MovementSystem.js';
import { PhysicsSeparationSystem } from '../src/systems/PhysicsSeparationSystem.js';
import { TargetingSystem } from '../src/systems/TargetingSystem.js';
import { WeaponSystem } from '../src/systems/WeaponSystem.js';
import { CollisionSystem } from '../src/systems/CollisionSystem.js';
import { DamageSystem } from '../src/systems/DamageSystem.js';
import { EconomySystem } from '../src/systems/EconomySystem.js';
import { TowerComponent } from '../src/components/TowerComponent.js';
import { TransformComponent } from '../src/components/TransformComponent.js';
import { CircleColliderComponent } from '../src/components/CircleColliderComponent.js';
import { AttackComponent } from '../src/components/AttackComponent.js';
import { TargetComponent } from '../src/components/TargetComponent.js';
import { HealthComponent } from '../src/components/HealthComponent.js';
import { ArmorComponent } from '../src/components/ArmorComponent.js';
import { DefenseComponent } from '../src/components/DefenseComponent.js';
import { RenderComponent } from '../src/components/RenderComponent.js';
import { EconomyComponent } from '../src/components/EconomyComponent.js';
import { VelocityComponent } from '../src/components/VelocityComponent.js';
import { EnemyComponent } from '../src/components/EnemyComponent.js';

function scene(width = 1200, height = 800, speed = 1) {
  const world = new World(); Object.assign(world, { width, height, gameSpeed: speed });
  const tower = world.createEntity(), cfg = GameConfig.tower;
  const hp = new HealthComponent(cfg.baseHealth, cfg.baseHealth, cfg.baseRegen);
  const attack = new AttackComponent(cfg.baseDamage, cfg.baseAttackSpeed, cfg.baseRange, 0,
    cfg.baseCritChance, cfg.baseCritMultiplier, cfg.baseMultishotCount, cfg.baseMultishotChance, cfg.baseDistanceDamageCoeff);
  const economy = new EconomyComponent();
  for (const c of [new TowerComponent(), new TransformComponent(width / 2, height / 2),
    new CircleColliderComponent(cfg.colliderRadius, 1000, true), hp, attack, new TargetComponent(),
    new ArmorComponent(), new DefenseComponent(), new RenderComponent('tower', 8, cfg.radius), economy]) world.addComponent(tower, c);
  const waves = new WaveSystem(), upgrades = new UpgradeManager();
  for (const system of [new MovementSystem(), new PhysicsSeparationSystem(), new TargetingSystem(),
    new WeaponSystem(), new CollisionSystem(), new DamageSystem(), waves, new EconomySystem()]) world.registerSystem(system);
  upgrades.init(world); upgrades.applyAll(world, tower);
  return { world, tower, hp, attack, economy, waves, upgrades };
}

function isolatedBoss(run, rotation, direction = 1, speedFactor = 1, distance = 130) {
  run.waves.stageId = 3; run.waves.currentWave = 20;
  const boss = run.waves._spawnEnemy(run.world, 'boss_architect');
  Object.assign(run.world.getComponent(boss, TransformComponent), { x: run.world.width / 2 + distance, y: run.world.height / 2, rotation });
  run.world.getComponent(boss, EnemyComponent).rotationSpeed = direction * GameConfig.enemies.boss_architect.rotationSpeed;
  run.world.getComponent(boss, VelocityComponent).currentSpeed = GameConfig.enemies.boss_architect.baseSpeed * speedFactor;
  return run.world.getComponent(boss, HealthComponent);
}

test('stage-three siege boss can be beaten with 241 damage and 700 HP across rotations, speeds and x3', () => {
  for (const speed of [1, 3]) for (const direction of [-1, 1]) for (const speedFactor of [.93, 1.07]) for (let angle = 0; angle < 8; angle++) {
    const run = scene(1200, 800, speed);
    run.upgrades.levels.set('damage', 36); run.upgrades.levels.set('maxHealth', 5); run.upgrades.applyAll(run.world, run.tower);
    const bossHp = isolatedBoss(run, angle / 8 * Math.PI / 2, direction, speedFactor);
    assert.equal(bossHp.max, 3822); assert.equal(run.attack.damage, 241);
    for (let time = 0; time < 30 && !run.world.isGameOver && bossHp.current > 0; time += speed / 60) run.world.update(1 / 60);
    assert.equal(bossHp.current, 0, `boss survived: angle ${angle}, direction ${direction}, speed ${speed}, jitter ${speedFactor}`);
    assert.ok(run.hp.current > 80, `insufficient survival margin: ${run.hp.current}`);
  }
});

test('stage-three build survives a siege starting at an already aligned drilling position', () => {
  const run = scene(); run.upgrades.levels.set('damage', 36); run.upgrades.levels.set('maxHealth', 5); run.upgrades.applyAll(run.world, run.tower);
  const bossHp = isolatedBoss(run, Math.PI / 4, 1, 1, 118);
  for (let time = 0; time < 30 && !run.world.isGameOver && bossHp.current > 0; time += 1 / 120) run.world.update(1 / 120);
  assert.equal(bossHp.current, 0); assert.ok(run.hp.current > 100);
});

test('a completely unupgraded tower still loses to the final boss', () => {
  const run = scene(), bossHp = isolatedBoss(run, Math.PI / 4, 1, 1, 118);
  for (let time = 0; time < 30 && !run.world.isGameOver && bossHp.current > 0; time += 1 / 60) run.world.update(1 / 60);
  assert.equal(run.world.isGameOver, true); assert.equal(run.hp.current, 0); assert.ok(bossHp.current > 0);
});

function seeded(seed, callback) {
  const previous = Math.random;
  Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  try { return callback(); } finally { Math.random = previous; }
}

for (const [width, height, speed] of [[1200, 800, 1], [640, 1100, 1], [640, 640, 3]]) {
  test(`fresh profile clears all ten waves with damage and two affordable HP levels: ${width}x${height}, x${speed}`, () => {
    for (const seed of [1, 7, 12345]) seeded(seed, () => {
      const run = scene(width, height, speed); let bosses = 0;
      assert.equal(run.economy.credits, 0); assert.equal(run.attack.critChance, 0);
      run.world.eventBus.on('CREDITS_CHANGED', ({ earned }) => {
        if (earned > 0) while (run.upgrades.buyUpgrade('damage', run.world)) { /* Spend only earned credits. */ }
      });
      run.world.eventBus.on('ENEMY_SPAWNED', ({ type }) => { if (type.startsWith('boss_')) bosses++; });
      run.world.eventBus.on('WAVE_STARTED', ({ wave }) => {
        if (wave === 10) {
          // Two affordable HP levels before the first boss.
          assert.equal(run.upgrades.buyUpgrade('maxHealth', run.world), true);
          assert.equal(run.upgrades.buyUpgrade('maxHealth', run.world), true);
        }
      });
      run.waves.startFirstWave(run.world, 1);
      for (let time = 0; time < 600 && !run.world.isGameOver; time += speed / 60) run.world.update(1 / 60);
      assert.equal(run.world.runOutcome, 'victory', `seed ${seed}, wave ${run.waves.currentWave}, tower HP ${run.hp.current}`);
      assert.equal(bosses, 1);
      assert.ok(run.hp.current > 0); assert.equal(run.economy.crystalsSettled, true);
      assert.equal(run.upgrades.getLevel('maxHealth'), 2); assert.equal(run.upgrades.getLevel('attackSpeed'), 0);
    });
  });
}
