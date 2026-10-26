import { ALL_UPGRADE_TIERS } from '../src/config/UpgradeTiers.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/core/World.js';
import { EconomySystem } from '../src/systems/EconomySystem.js';
import { EconomyComponent } from '../src/components/EconomyComponent.js';
import { TowerComponent } from '../src/components/TowerComponent.js';
import { PlayerProgress } from '../src/managers/PlayerProgress.js';
import { UpgradeManager } from '../src/managers/UpgradeManager.js';
import { GameConfig } from '../src/config/GameConfig.js';

function storage() {
  const data = new Map();
  return { writes: 0, getItem: key => data.get(key) ?? null,
    setItem(key, value) { this.writes++; data.set(key, value); } };
}
function setup() {
  const world = new World(), bank = storage(), progress = new PlayerProgress(bank);
  const id = world.createEntity(), economy = new EconomyComponent(100000);
  world.addComponent(id, new TowerComponent()); world.addComponent(id, economy);
  world.registerSystem(new EconomySystem()); progress.init(world);
  const upgrades = new UpgradeManager({}, ALL_UPGRADE_TIERS); upgrades.init(world); upgrades.applyAll(world, id);
  return { world, economy, progress, bank, upgrades, id };
}
function withRandom(value, fn) { const original = Math.random; Math.random = () => value; try { fn(); } finally { Math.random = original; } }
const kill = (world, type = 'scout', reward = 10) => world.eventBus.emit('ENTITY_DIED', { isEnemy: true, enemyType: type, baseReward: reward, x: 10, y: 20 });

test('kill credits are reduced fivefold while small bounties, economy bonuses, microchips and wave rewards still work', () => {
  const { world, economy } = setup(), events = [];
  economy.credits = 0;
  world.eventBus.on('CREDITS_CHANGED', event => events.push(event));
  withRandom(.5, () => {
    kill(world, 'scout', 10); assert.equal(economy.credits, 2);
    kill(world, 'splitter_shard', 6); assert.equal(economy.credits, 3);
    kill(world, 'boss_architect', 350); assert.equal(economy.credits, 73);
    kill(world, 'scout', 0); assert.equal(economy.credits, 73);
  });
  assert.deepEqual(events.map(event => event.earned), [2, 1, 70]);
  assert.ok(events.every(event => event.source === 'kill' && event.x === 10 && event.y === 20));
  economy.killMultiplier = 1.5;
  withRandom(0, () => kill(world, 'scout', 10));
  assert.equal(economy.credits, 76); assert.equal(economy.runCrystals, 1);
  world.eventBus.emit('WAVE_COMPLETED', { wave: 1 });
  assert.equal(economy.credits, 91); assert.equal(economy.runCrystals, 3);
});

test('kills roll one crystal independently of credits; every enemy type can drop, and rewards stay pending', () => {
  const { world, economy, progress, bank } = setup();
  const enemyCount = Object.keys(GameConfig.enemies).length;
  for (const type of Object.keys(GameConfig.enemies)) withRandom(.009, () => kill(world, type, 0));
  assert.equal(economy.runCrystals, enemyCount);
  assert.equal(economy.credits, 100000);
  withRandom(.01, () => kill(world)); assert.equal(economy.runCrystals, enemyCount);
  withRandom(0, () => world.eventBus.emit('ENTITY_DIED', { isEnemy: false }));
  world.inMenu = true; withRandom(0, () => kill(world)); world.inMenu = false;
  assert.equal(economy.runCrystals, enemyCount); assert.equal(progress.crystals, 0); assert.equal(bank.writes, 0);
});

test('wave crystals grow linearly, apply only the crystal wave multiplier, and cannot repeat the same award', () => {
  const { world, economy } = setup();
  economy.killMultiplier = economy.waveMultiplier = 100;
  economy.crystalWaveMultiplier = 1.2;
  world.eventBus.emit('WAVE_COMPLETED', { wave: 1 });
  assert.equal(economy.runCrystals, 2);
  world.eventBus.emit('WAVE_COMPLETED', { wave: 1 }); assert.equal(economy.runCrystals, 2);
  world.eventBus.emit('WAVE_COMPLETED', { wave: 2 }); assert.equal(economy.runCrystals, 5);
  for (const wave of [-1, 0, NaN, 1.5]) world.eventBus.emit('WAVE_COMPLETED', { wave });
  assert.equal(economy.runCrystals, 5);
});

test('only actual defeat banks crystals, once; restart and voluntary exit cannot deposit', () => {
  const { world, economy, progress, bank } = setup();
  economy.runCrystals = 37;
  world.eventBus.emit('GAME_OVER', {}); assert.equal(progress.crystals, 0);
  world.eventBus.emit('RESTART_GAME'); world.eventBus.emit('RETURN_TO_MENU');
  assert.equal(progress.crystals, 0); assert.equal(bank.writes, 0);
  world.isGameOver = true; world.eventBus.emit('GAME_OVER', {});
  assert.equal(progress.crystals, 37); assert.equal(bank.writes, 1);
  world.eventBus.emit('GAME_OVER', {});
  withRandom(0, () => kill(world)); world.eventBus.emit('WAVE_COMPLETED', { wave: 10 });
  assert.equal(progress.crystals, 37); assert.equal(economy.runCrystals, 37); assert.equal(bank.writes, 1);
  assert.equal(new PlayerProgress(bank).crystals, 37);
});

test('run upgrades use credits, change the intended reward only, keep drop upgrades uncapped, and reset for the next run', () => {
  const { world, economy, upgrades, id } = setup();
  assert.equal(upgrades.buyUpgrade('crystalDropChance', world), true);
  assert.ok(Math.abs(economy.crystalDropChance - .012) < 1e-12);
  assert.equal(economy.crystalWaveMultiplier, 1);
  assert.equal(upgrades.buyUpgrade('crystalWaveBonus', world), true);
  assert.equal(economy.crystalWaveMultiplier, 1.2);
  assert.equal(economy.credits, 100000 - 15 - 16);
  upgrades.levels.set('crystalDropChance', 40); upgrades.applyAll(world, id);
  assert.equal(economy.crystalDropChance, .09);
  assert.ok(Number.isFinite(upgrades.getCost('crystalDropChance')));
  upgrades.reset(); upgrades.applyAll(world, id);
  assert.equal(economy.crystalDropChance, .01); assert.equal(economy.crystalWaveMultiplier, 1);
});

test('free economy upgrades include both new upgrades and use the pre-upgrade payout for that wave', () => {
  const { world, economy, upgrades } = setup();
  for (const [id, def] of Object.entries(GameConfig.upgrades)) {
    if (def.category === 'utility' && id !== 'crystalWaveBonus') upgrades.levels.set(id, def.maxLevel || 1);
  }
  economy.crystalWaveMultiplier = 1;
  const original = upgrades.isUnlocked.bind(upgrades);
  upgrades.isUnlocked = id => id === 'crystalWaveBonus' && original(id);
  withRandom(0, () => world.eventBus.emit('WAVE_COMPLETED', { wave: 1 }));
  assert.equal(upgrades.getLevel('crystalWaveBonus'), 1);
  assert.equal(economy.runCrystals, 2);
  assert.equal(economy.crystalWaveMultiplier, 1.2);
});

test('permanent storage rejects corrupt values, survives unavailable storage, and merges sequential tab deposits', () => {
  const bank = storage();
  for (const value of ['bad json', '{"version":1,"crystals":-3}', '{"version":1,"crystals":1.5}', '{"version":1,"crystals":"99"}']) {
    bank.setItem('cyber-core.progress.v1', value); assert.equal(new PlayerProgress(bank).crystals, 0);
  }
  const broken = new PlayerProgress({ getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } });
  assert.equal(broken.credit(9), true); assert.equal(broken.credit(2), true);
  assert.equal(broken.crystals, 11); assert.equal(broken.saved, false);
  const empty = storage(), first = new PlayerProgress(empty), second = new PlayerProgress(empty);
  first.credit(7); second.credit(8); assert.equal(new PlayerProgress(empty).crystals, 15);
  for (const invalid of [-1, .5, NaN, Infinity, Number.MAX_SAFE_INTEGER]) assert.equal(second.credit(invalid), false);
});
