import test from 'node:test';
import assert from 'node:assert/strict';
import { PlayerProgress } from '../src/managers/PlayerProgress.js';
import { UpgradeManager } from '../src/managers/UpgradeManager.js';
import { UPGRADE_TIERS, ALL_UPGRADE_TIERS } from '../src/config/UpgradeTiers.js';
import { GameConfig } from '../src/config/GameConfig.js';
import { World } from '../src/core/World.js';
import { TowerComponent } from '../src/components/TowerComponent.js';
import { AttackComponent } from '../src/components/AttackComponent.js';
import { EconomyComponent } from '../src/components/EconomyComponent.js';
import { UIManager, EnemyIntelRenderer } from '../src/ui/UIManager.js';
import { DevTools } from '../src/ui/DevTools.js';

function setup() {
  const data = new Map(), storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  const world = new World(); world.inMenu = true;
  const progress = new PlayerProgress(storage); progress.init(world);
  return { world, progress, storage, data };
}
const baseIds = ['damage', 'attackSpeed', 'range', 'maxHealth', 'healthRegen', 'killCashBonus', 'waveCashBonus'];

test('fresh saves expose exactly seven basic upgrades and no critical hits before the critical tier', () => {
  const { world, progress } = setup();
  const manager = progress.getUpgradeManager();
  assert.deepEqual(manager.getAllUpgrades().filter(u => manager.hasAccess(u.id)).map(u => u.id).sort(), baseIds.sort());
  const tower = world.createEntity(), attack = new AttackComponent();
  world.addComponent(tower, new TowerComponent()); world.addComponent(tower, attack);
  manager.applyAll(world, tower); assert.equal(attack.critChance, 0);
  progress.credit(1000);
  for (const id of Object.keys(GameConfig.upgrades).filter(id => !baseIds.includes(id))) assert.equal(progress.buyUpgrade(id), false, id);
  assert.equal(progress.buyTier('offense', 2), true);
  manager.setPermanentLevels(progress.upgrades, progress.unlockedTiers); manager.applyAll(world, tower);
  assert.equal(attack.critChance, GameConfig.tower.baseCritChance);
  assert.equal(manager.getLevel('critChance'), 0);
});

test('tiers are sequential within each branch, charge once and grant access to the whole pair without levels', () => {
  const { world, progress, storage } = setup(); progress.credit(1000);
  let events = 0; world.eventBus.on('UPGRADE_TIER_UNLOCKED', () => events++);
  for (const [category, tier] of [['offense', 3], ['utility', 4], ['invalid', 2], ['__proto__', 2], ['defense', 1], ['offense', 2.5]]) {
    assert.equal(progress.buyTier(category, tier), false);
  }
  assert.equal(progress.crystals, 1000);
  assert.equal(progress.buyTier('offense', 2), true); assert.equal(progress.crystals, 980);
  assert.equal(progress.buyTier('offense', 2), false); assert.equal(events, 1);
  assert.deepEqual(progress.upgrades, {});
  assert.equal(progress.getUpgradeManager().hasAccess('critChance'), true);
  assert.equal(progress.getUpgradeManager().hasAccess('critDamage'), true);
  assert.equal(progress.getUpgradeManager().hasAccess('multishotChance'), false);
  assert.equal(progress.buyTier('defense', 2), true); // Independent chain.
  const loaded = new PlayerProgress(storage);
  assert.deepEqual(loaded.unlockedTiers, { offense: 2, defense: 2, utility: 1 });
  world.inMenu = false; assert.equal(progress.buyTier('offense', 3), false);
  assert.equal(progress.buyUpgrade('critChance'), false);
  world.inMenu = true; progress.crystals = 0; progress.dirty = true;
  assert.equal(progress.buyTier('offense', 3), false);
});

test('economy opens microchip bonuses, then free attack, defense and economy in separate tiers', () => {
  const { progress } = setup(); progress.credit(1000);
  for (const [tier, ids] of [[2, ['crystalDropChance', 'crystalWaveBonus']], [3, ['freeAttackChance']], [4, ['freeDefenseChance']], [5, ['freeEconomyChance']]]) {
    assert.equal(progress.buyTier('utility', tier), true);
    for (const id of ids) assert.equal(progress.getUpgradeManager().hasAccess(id), true);
    for (const next of UPGRADE_TIERS.utility.slice(tier).flatMap(item => item.ids)) assert.equal(progress.getUpgradeManager().hasAccess(next), false);
  }
  const ids = Object.values(UPGRADE_TIERS).flatMap(tiers => tiers.flatMap(tier => tier.ids));
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(ids.sort(), Object.keys(GameConfig.upgrades).sort());
});

test('battle purchases and free upgrades cannot bypass unopened tiers; only accessible candidates can be granted', () => {
  const { world } = setup(); world.inMenu = false;
  const tower = world.createEntity(); world.addComponent(tower, new TowerComponent());
  world.addComponent(tower, new EconomyComponent(10000));
  const manager = new UpgradeManager({}, { utility: 3 });
  manager.levels.set('freeAttackChance', 34);
  assert.equal(manager.buyUpgrade('ricochetChance', world), false);
  const oldRandom = Math.random; Math.random = () => .999;
  try {
    for (let wave = 1; wave <= 100; wave++) {
      const grants = manager.rollFreeUpgrades(world, wave);
      assert.equal(grants.length, 1);
      assert.ok(['damage', 'attackSpeed', 'range'].includes(grants[0].upgradeId));
    }
  } finally { Math.random = oldRandom; }
  assert.equal(manager.getLevel('ricochetChance'), 0);
  assert.equal(world.getComponent(tower, EconomyComponent).credits, 10000);
});

test('legacy stat saves preserve all purchased levels and infer prerequisite tiers; new saves do not infer forged access', () => {
  const { storage, data, progress } = setup();
  data.set(progress.key, JSON.stringify({ version: 1, crystals: 88, upgrades: { rapidFireDuration: 4, freeDefenseChance: 2 }, completedStages: 3 }));
  const legacy = new PlayerProgress(storage);
  assert.deepEqual(legacy.unlockedTiers, { offense: 5, defense: 1, utility: 4 });
  assert.equal(legacy.getUpgradeManager().getLevel('rapidFireDuration'), 4); assert.equal(legacy.completedStages, 3);
  data.set(progress.key, JSON.stringify({ version: 1, crystals: 88, upgrades: { rapidFireDuration: 4 }, unlockedTiers: { offense: 1, utility: -3, defense: 999 } }));
  const loaded = new PlayerProgress(storage);
  assert.deepEqual(loaded.unlockedTiers, { offense: 1, defense: 4, utility: 1 });
  assert.deepEqual(loaded.upgrades, {});
});

test('cross-tab access purchases refresh the same wallet and preserve both categories', () => {
  const { progress, storage, world } = setup(); progress.credit(100);
  const other = new PlayerProgress(storage); other.init(world);
  assert.equal(progress.buyTier('offense', 2), true);
  assert.equal(other.buyTier('offense', 2), false);
  assert.equal(other.buyTier('defense', 2), true);
  progress.credit(1);
  assert.equal(progress.crystals, 61);
  assert.deepEqual(progress.unlockedTiers, { offense: 2, defense: 2, utility: 1 });
});

test('bestiary reveals only completed-stage enemies and delays each synergy until its stage is completed', () => {
  const { progress } = setup();
  const types = ['scout', 'boss_scout', 'boss_architect', 'fighter', 'boss_carrier', 'tank', 'sniper', 'boss_railgun', 'aegis', 'boss_citadel', 'splitter', 'boss_fractal', 'blinker'];
  const cards = types.map(type => ({ dataset: { enemyCard: type }, hidden: true }));
  const notes = [2, 3, 5].map(stage => ({ dataset: { intelStage: String(stage) }, hidden: true }));
  let refreshes = 0;
  const ui = Object.assign(Object.create(UIManager.prototype), { playerProgress: progress,
    dom: { modalIntel: { querySelectorAll: selector => selector === '[data-enemy-card]' ? cards : notes } },
    intelRenderer: { _initCanvases() { refreshes++; } } });
  for (let completed = 0; completed <= 8; completed++) {
    if (completed) progress.credit(0, completed);
    ui._updateBestiary();
    const expected = completed === 0 ? ['scout'] : completed === 1 ? ['scout', 'boss_scout']
      : completed === 2 ? ['scout', 'boss_scout', 'fighter', 'boss_carrier'] : types.slice(0, Math.min(13, completed + 3 + (completed >= 4 ? 1 : 0) + (completed >= 5 ? 1 : 0) + (completed >= 6 ? 1 : 0)));
    assert.deepEqual(cards.filter(c => !c.hidden).map(c => c.dataset.enemyCard), expected);
    assert.deepEqual(notes.map(note => !note.hidden), [completed >= 2, completed >= 3, completed >= 5]);
    const before = refreshes; ui._updateBestiary(); assert.equal(refreshes, before);
  }
  progress.credit(10); ui._updateBestiary(); assert.equal(refreshes, 9, 'currency changes never recreate previews');
  progress.reset(); ui._updateBestiary(); assert.deepEqual(cards.filter(c => !c.hidden).map(c => c.dataset.enemyCard), ['scout']);
  assert.ok(notes.every(note => note.hidden));
});

test('hidden bestiary entries never allocate a canvas context or render their preview', () => {
  const previous = globalThis.document, visible = [], hidden = [];
  const canvas = (name, closed) => ({ dataset: { enemy: name }, closest: () => ({ hidden: closed }), getContext() { (closed ? hidden : visible).push(name); return {}; } });
  globalThis.document = { querySelectorAll: () => [canvas('scout', false), canvas('aegis', true)] };
  const renderer = Object.assign(Object.create(EnemyIntelRenderer.prototype), { render() {} });
  try { renderer._initCanvases(); assert.deepEqual(visible, ['scout']); assert.deepEqual(hidden, []); assert.equal(renderer.canvases.length, 1); }
  finally { globalThis.document = previous; }
});

test('dev reset requires its confirmation, abandons the run and resets wallet, stats, tiers, stages and bestiary persistently', () => {
  const { progress, world, storage, data } = setup(); progress.credit(1000, 1);
  progress.buyTier('offense', 2); progress.buyUpgrade('damage');
  data.set('cyber-core.language.v1', 'en');
  let exits = 0; const confirmation = { hidden: true };
  const dev = Object.assign(Object.create(DevTools.prototype), { world, desktop: { matches: true }, flags: {}, refresh() {},
    element: { querySelector: () => confirmation }, app: { playerProgress: progress, returnToMenu() { exits++; world.inMenu = true; } } });
  world.inMenu = false;
  assert.equal(dev.execute('confirm-reset-progress'), false); assert.equal(progress.crystals, 955);
  dev.execute('reset-progress'); assert.equal(confirmation.hidden, false);
  dev.execute('cancel-reset-progress'); assert.equal(confirmation.hidden, true); assert.equal(exits, 0);
  dev.execute('reset-progress'); dev.execute('confirm-reset-progress'); assert.equal(exits, 1);
  const loaded = new PlayerProgress(storage);
  assert.equal(loaded.crystals, 0); assert.equal(loaded.completedStages, 0); assert.deepEqual(loaded.upgrades, {});
  assert.deepEqual(loaded.unlockedTiers, { offense: 1, defense: 1, utility: 1 });
  assert.equal(loaded.isStageUnlocked(2), false); assert.equal(loaded.getUpgradeManager().hasAccess('critChance'), false);
  assert.equal(data.get('cyber-core.language.v1'), 'en');
});

test('session-only tier purchases and reset survive unavailable storage without restoring stale progress', () => {
  const storage = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } };
  const progress = new PlayerProgress(storage), world = new World(); world.inMenu = true; progress.init(world);
  progress.credit(100); assert.equal(progress.buyTier('offense', 2), true); assert.equal(progress.saved, false);
  progress.reset(); progress.credit(1);
  assert.equal(progress.crystals, 1); assert.equal(progress.unlockedTiers.offense, 1);
});
