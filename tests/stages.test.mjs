import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/core/World.js';
import { STAGES, STAGE_ENEMIES } from '../src/config/StageConfig.js';
import { WaveSystem } from '../src/systems/WaveSystem.js';
import { EconomySystem } from '../src/systems/EconomySystem.js';
import { DamageSystem } from '../src/systems/DamageSystem.js';
import { PlayerProgress } from '../src/managers/PlayerProgress.js';
import { TowerComponent } from '../src/components/TowerComponent.js';
import { EconomyComponent } from '../src/components/EconomyComponent.js';
import { HealthComponent } from '../src/components/HealthComponent.js';
import { TransformComponent } from '../src/components/TransformComponent.js';
import { EnemyComponent } from '../src/components/EnemyComponent.js';
import { UIManager } from '../src/ui/UIManager.js';
import { i18n } from '../src/i18n/I18n.js';

function storage() {
  const values = new Map();
  return { writes: 0, getItem: key => values.get(key) ?? null, setItem(key, value) { this.writes++; values.set(key, value); } };
}
function setup(bank = storage()) {
  const world = new World(), waves = new WaveSystem(), progress = new PlayerProgress(bank);
  const tower = world.createEntity(), eco = new EconomyComponent(100);
  for (const component of [new TowerComponent(), eco, new HealthComponent(300, 300), new TransformComponent(600, 400)]) world.addComponent(tower, component);
  world.registerSystem(waves); world.registerSystem(new EconomySystem()); progress.init(world);
  return { world, waves, progress, eco, tower, bank };
}

test('eight campaign rosters introduce one enemy per second half, configured bosses only appear on the final wave', () => {
  const waves = new WaveSystem();
  assert.equal(STAGES.length, 8);
  for (const stage of STAGES) {
    waves.stageId = stage.id;
    const first = STAGE_ENEMIES.slice(0, Math.max(1, stage.id - 1));
    const second = STAGE_ENEMIES.slice(0, Math.min(7, stage.id));
    for (let wave = 1; wave <= stage.waves; wave++) {
      const enemies = waves._generateWaveEnemies(wave);
      if (stage.boss && wave === stage.waves) assert.deepEqual(enemies, [stage.boss]);
      else {
        assert.deepEqual([...new Set(enemies)].sort(), [...(wave <= 10 ? first : second)].sort(), `stage ${stage.id}, wave ${wave}`);
        assert.ok(enemies.length >= 9 && enemies.length <= 40);
      }
    }
    assert.deepEqual(waves._generateWaveEnemies(stage.waves + 1), []);
    assert.deepEqual(waves._generateWaveEnemies(0), []);
  }
});

test('the first scout boss finishes stage one, pays once and unlocks the next stage', () => {
  const { world, waves, progress, eco, bank } = setup();
  let wins = 0, defeats = 0;
  world.eventBus.on('STAGE_COMPLETED', () => wins++);
  world.eventBus.on('GAME_OVER', () => defeats++);
  waves.startFirstWave(world, 1);
  eco.crystalDropChance = 0;
  waves.currentWave = 10; waves._startWave(world);
  while (waves.spawnQueue.length) waves.update(world, 1);
  assert.equal(world.getEntitiesWith(EnemyComponent).length, 1);
  for (const id of world.getEntitiesWith(EnemyComponent)) {
    assert.equal(world.getComponent(id, EnemyComponent).type, 'boss_scout');
    assert.equal(world.getComponent(id, HealthComponent).max, 755);
    new DamageSystem()._applyDamageToEntity(world, id, 1e9, false);
  }
  assert.equal(world.getEntitiesWith(EnemyComponent).length, 0);
  world._flushDestructionQueue();
  waves.update(world, 0);
  assert.equal(wins, 1); assert.equal(defeats, 0);
  assert.equal(eco.runCrystals, 11); assert.equal(progress.crystals, eco.runCrystals);
  assert.equal(progress.completedStages, 1); assert.equal(bank.writes, 1);
  assert.equal(new PlayerProgress(bank).isStageUnlocked(2), true);
  assert.equal(new PlayerProgress(bank).isStageUnlocked(3), false);
  assert.equal(world.isGameOver && world.isPaused, true); assert.equal(world.runOutcome, 'victory');
  for (let i = 0; i < 20; i++) { waves.update(world, 10); waves._completeWave(world); }
  world.eventBus.emit('STAGE_COMPLETED', { stage: 1 }); world.eventBus.emit('GAME_OVER', {});
  assert.equal(progress.crystals, 11); assert.equal(bank.writes, 1); assert.equal(waves.currentWave, 10);
});

test('stage two wave ten is ordinary combat; wave eleven introduces fighters and wave twenty is the final boss', () => {
  const { world, waves, progress } = setup();
  waves.startFirstWave(world, 2);
  waves.currentWave = 10; waves._startWave(world);
  assert.deepEqual([...new Set(waves.spawnQueue)], ['scout']);
  waves.spawnQueue.length = 0; waves.update(world, 0);
  assert.equal(waves.state, 'INTERMISSION'); assert.equal(waves.currentWave, 11);
  assert.equal(progress.completedStages, 0); assert.equal(world.isGameOver, false);
  waves.update(world, 6);
  assert.ok(waves.spawnQueue.includes('fighter')); assert.ok(waves.spawnQueue.includes('scout'));
  waves.currentWave = 20; waves._startWave(world);
  assert.deepEqual(waves.spawnQueue, ['boss_carrier']);
});

test('a complete campaign unlocks exactly eight stages; replay rewards cannot advance the campaign twice', () => {
  const { world, waves, progress, eco, bank } = setup();
  for (const stage of STAGES) {
    assert.equal(progress.isStageUnlocked(stage.id), true);
    world.isGameOver = false; world.isPaused = false; eco.crystalsSettled = false;
    waves.startFirstWave(world, stage.id);
    waves.currentWave = stage.waves; waves.spawnQueue.length = 0;
    waves._completeWave(world);
    assert.equal(progress.completedStages, stage.id);
    assert.equal(new PlayerProgress(bank).completedStages, stage.id);
  }
  assert.equal(progress.isStageUnlocked(9), false);
  world.isGameOver = false; eco.crystalsSettled = false;
  waves.startFirstWave(world, 1); waves.currentWave = 10; waves._completeWave(world);
  assert.equal(progress.completedStages, 8);
});

test('defeat pays pending chips without unlocking stages; exit/restart and premature completion pay nothing', () => {
  const { world, waves, progress, eco } = setup();
  waves.startFirstWave(world, 1); eco.runCrystals = 17;
  world.eventBus.emit('STAGE_COMPLETED', { stage: 1 });
  world.eventBus.emit('RETURN_TO_MENU'); world.eventBus.emit('RESTART_GAME');
  assert.equal(progress.crystals, 0); assert.equal(progress.completedStages, 0);
  world.isGameOver = true; world.eventBus.emit('GAME_OVER', {});
  assert.equal(progress.crystals, 17); assert.equal(progress.completedStages, 0);
  waves.update(world, 100); assert.equal(progress.completedStages, 0);
});

test('zero-chip victories still save unlocks; old saves, tab updates and unavailable storage retain progress', () => {
  const bank = storage();
  bank.setItem('cyber-core.progress.v1', JSON.stringify({ version: 1, crystals: 90, upgrades: { damage: 2 } }));
  const first = new PlayerProgress(bank), second = new PlayerProgress(bank);
  assert.equal(first.completedStages, 0); assert.equal(first.isStageUnlocked(2), false);
  assert.equal(first.credit(0, 1), true);
  second.credit(10);
  const loaded = new PlayerProgress(bank);
  assert.equal(loaded.completedStages, 1); assert.equal(loaded.crystals, 100); assert.equal(loaded.upgrades.damage, 2);
  loaded.credit(0, 3); assert.equal(loaded.completedStages, 1); // cannot skip a locked stage
  for (const id of [0, -1, 1.5, 9, NaN]) assert.equal(loaded.isStageUnlocked(id), false);
  const broken = new PlayerProgress({ getItem() { throw Error(); }, setItem() { throw Error(); } });
  broken.credit(0, 1); broken.credit(5); assert.equal(broken.completedStages, 1); assert.equal(broken.crystals, 5);
  assert.equal(broken.saved, false);
});

test('stage scaling is shared by bodies and splitter children, and sandbox stats remain unchanged', () => {
  const { world, waves } = setup();
  waves.startFirstWave(world, 6); waves.currentWave = 15;
  const splitter = waves._spawnEnemy(world, 'splitter');
  waves._spawnSplitterShards(world, 100, 100);
  const shard = world.getEntitiesWith(EnemyComponent).find(id => world.getComponent(id, EnemyComponent).type === 'splitter_shard');
  assert.ok(world.getComponent(splitter, HealthComponent).max > 65 * 1.1 ** 14);
  assert.equal(world.getComponent(shard, HealthComponent).max, Math.round(18 * 1.1 ** 14 * STAGES[5].hpMultiplier));
  const boss = waves._spawnEnemy(world, 'boss_architect');
  assert.equal(world.getComponent(boss, HealthComponent).max, Math.round(400 * 1.1 ** 14 * STAGES[5].hpMultiplier));
  assert.equal(world.getComponent(boss, EnemyComponent).shieldIds, null);
  waves.startFirstWave(world);
  const scout = waves._spawnEnemy(world, 'scout'); assert.equal(world.getComponent(scout, HealthComponent).max, 25);
  assert.equal(waves.startFirstWave(world, 9), false); assert.equal(world.stageId, null);
});

test('campaign HUD distinguishes the middle wave from the boss, preserves the final result across language changes', () => {
  const ui = Object.create(UIManager.prototype), node = () => ({ textContent: '', hidden: true, classList: { toggle() {} } });
  ui.world = { stageId: 2, runOutcome: 'victory' }; ui.currentWave = 20;
  ui.dom = { resultTitle: node(), resultDescription: node(), resultUnlock: node(), btnRestart: node(), finalWaveText: node(), intermissionText: node() };
  assert.equal(ui._isBossWave(10), false); assert.equal(ui._isBossWave(20), true);
  ui.world.stageId = 1; assert.equal(ui._isBossWave(10), true); ui.world.stageId = 2;
  ui._updateIntermissionText({ nextWave: 10, remaining: 1 }); assert.match(ui.dom.intermissionText.textContent, /ВОЛНЫ 10/);
  i18n.setLanguage('en');
  try {
    assert.equal(ui._waveLabel(), 'Wave 20/20:');
    ui._updateResultText(); assert.equal(ui.dom.resultTitle.textContent, 'STAGE CLEARED');
    assert.equal(ui.dom.finalWaveText.textContent, 'Stage 2 · Wave 20');
    assert.equal(ui.dom.resultUnlock.textContent, 'Next stage: 3');
    ui.world.stageId = 8; ui._updateResultText(); assert.equal(ui.dom.resultUnlock.textContent, 'All 8 stages cleared!');
  } finally { i18n.setLanguage('ru'); }
});
