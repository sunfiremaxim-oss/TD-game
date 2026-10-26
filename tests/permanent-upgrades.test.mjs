import test from 'node:test';
import assert from 'node:assert/strict';
import { PlayerProgress } from '../src/managers/PlayerProgress.js';
import { UpgradeManager } from '../src/managers/UpgradeManager.js';
import { GameConfig } from '../src/config/GameConfig.js';
import { World } from '../src/core/World.js';
import { TowerComponent } from '../src/components/TowerComponent.js';
import { EconomyComponent } from '../src/components/EconomyComponent.js';
import { EconomySystem } from '../src/systems/EconomySystem.js';
import { calculateMitigatedDamage } from '../src/combat/DamageCalculation.js';
import { ArmorComponent } from '../src/components/ArmorComponent.js';
import { ALL_UPGRADE_TIERS, UPGRADE_TIERS } from '../src/config/UpgradeTiers.js';

function storage() {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
}
function setup(bank = storage()) {
  const progress = new PlayerProgress(bank), world = new World();
  world.inMenu = true; progress.init(world);
  return { progress, world, bank };
}

test('all 26 permanent upgrades charge the wallet once and survive reload with identical starting stats', () => {
  const { progress, bank } = setup();
  progress.credit(100000);
  let spent = 0;
  for (const [category, tiers] of Object.entries(UPGRADE_TIERS)) for (let i = 1; i < tiers.length; i++) {
    spent += tiers[i].cost;
    assert.equal(progress.buyTier(category, i + 1), true);
  }
  for (const def of Object.values(GameConfig.upgrades)) {
    for (let level = 0; level < 2; level++) {
      spent += progress.getUpgradeManager().getCost(def.id);
      assert.equal(progress.buyUpgrade(def.id), true, def.id);
    }
  }
  const loaded = new PlayerProgress(bank), run = loaded.getUpgradeManager();
  assert.equal(loaded.crystals, 100000 - spent);
  assert.equal(Object.keys(loaded.upgrades).length, 26);
  for (const def of Object.values(GameConfig.upgrades)) {
    const reference = new UpgradeManager({}, ALL_UPGRADE_TIERS, { permanent: true }); reference.levels.set(def.id, 2);
    assert.equal(run.getLevel(def.id), 2);
    assert.equal(run.getCurrentValue(def.id), reference.getCurrentValue(def.id));
    assert.equal(run.getNextValue(def.id), reference.getNextValue(def.id));
    assert.equal(run.getCost(def.id), reference.getCost(def.id));
  }
});

test('battle and free levels never become permanent and restart restores purchased starting levels', () => {
  const { progress, world, bank } = setup();
  progress.credit(1000); progress.buyUpgrade('damage'); progress.buyUpgrade('damage');
  const run = new UpgradeManager(progress.upgrades), id = world.createEntity();
  world.addComponent(id, new TowerComponent()); world.addComponent(id, new EconomyComponent(1000));
  world.registerSystem(new EconomySystem());
  world.inMenu = false;
  assert.equal(run.buyUpgrade('damage', world), true);
  run._grantLevel('damage', world, id, 0, true);
  assert.equal(run.getLevel('damage'), 4);
  assert.equal(progress.buyUpgrade('damage'), false);
  assert.equal(new PlayerProgress(bank).upgrades.damage, 2);
  run.reset(); assert.equal(run.getLevel('damage'), 2);
  assert.equal(run.getCurrentValue('damage'), 37);
  assert.equal(world.getComponent(id, EconomyComponent).credits, 1000 - 8);
});

test('permanent prerequisites, insufficient funds and invalid IDs cannot spend or grant levels', () => {
  const { progress } = setup();
  progress.credit(170);
  assert.equal(progress.buyTier('offense', 2), true);
  assert.equal(progress.buyTier('offense', 3), true);
  for (const id of ['multishotTargets', 'ricochetCount', 'rapidFireDuration', 'knockbackPower', 'invalid', '__proto__']) {
    assert.equal(progress.buyUpgrade(id), false);
  }
  assert.equal(progress.crystals, 100);
  assert.equal(progress.buyUpgrade('multishotChance'), true);
  assert.equal(progress.buyUpgrade('multishotTargets'), false);
  progress.credit(100);
  assert.equal(progress.buyUpgrade('multishotTargets'), true);
  assert.equal(progress.getUpgradeManager().isUnlocked('multishotTargets'), true);
});

test('legacy wallet migration, sequential tab purchases and later deposits preserve levels and balance together', () => {
  const bank = storage();
  bank.setItem('cyber-core.progress.v1', JSON.stringify({ version: 1, crystals: 200 }));
  const first = setup(bank).progress, second = setup(bank).progress;
  assert.equal(first.buyUpgrade('damage'), true);
  assert.equal(second.buyUpgrade('damage'), true);
  first.credit(10);
  const loaded = new PlayerProgress(bank);
  assert.equal(loaded.crystals, 200 - 25 - 31 + 10);
  assert.equal(loaded.upgrades.damage, 2);
});

test('unavailable storage keeps purchased levels for the session and malformed levels never corrupt the wallet', () => {
  const broken = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } };
  const { progress } = setup(broken);
  progress.credit(100); assert.equal(progress.buyUpgrade('damage'), true);
  assert.equal(progress.crystals, 75); assert.equal(progress.upgrades.damage, 1); assert.equal(progress.saved, false);
  const bank = storage();
  bank.setItem('cyber-core.progress.v1', JSON.stringify({ version: 1, crystals: 99, upgrades: { damage: -1, range: 1.5, maxHealth: 2, fake: 20 } }));
  const loaded = new PlayerProgress(bank);
  assert.equal(loaded.crystals, 99); assert.deepEqual(loaded.upgrades, { maxHealth: 2 });
});

test('armor continues past the former 85% limit without negative damage or healing', () => {
  const world = new World(), tower = world.createEntity();
  world.addComponent(tower, new TowerComponent());
  const armor = new ArmorComponent(.9, 0); world.addComponent(tower, armor);
  assert.equal(calculateMitigatedDamage(world, tower, 100), 10);
  armor.percentReduction = 1.5;
  assert.equal(calculateMitigatedDamage(world, tower, 100), 1);
});

test('cheaper battle prices stay separate from permanent purchases across saved levels and resets', () => {
  const { progress, world, bank } = setup(); progress.credit(100);
  const battle = progress.getUpgradeManager({ permanent: false });
  assert.equal(battle.getCost('damage'), 5);
  assert.equal(battle.getCost('attackSpeed'), 7);
  assert.equal(battle.getCost('range'), 6);
  assert.equal(progress.getUpgradeManager().getCost('damage'), 25);
  assert.equal(progress.buyUpgrade('damage'), true);
  battle.setPermanentLevels(progress.upgrades, progress.unlockedTiers);
  assert.equal(battle.getCost('damage'), 6);
  assert.equal(progress.getUpgradeManager().getCost('damage'), 31);
  const id = world.createEntity(), economy = new EconomyComponent(100);
  world.addComponent(id, new TowerComponent()); world.addComponent(id, economy);
  world.registerSystem(new EconomySystem()); world.inMenu = false;
  assert.equal(battle.buyUpgrade('damage', world), true);
  assert.equal(economy.credits, 94);
  assert.equal(new PlayerProgress(bank).crystals, 75);
  assert.equal(new PlayerProgress(bank).upgrades.damage, 1);
  battle.reset(); assert.equal(battle.getCost('damage'), 6);
  world.inMenu = true; assert.equal(progress.buyUpgrade('damage'), true);
  assert.equal(progress.crystals, 44);
  assert.equal(progress.getUpgradeManager().getCost('damage'), 39);
  battle.setPermanentLevels(progress.upgrades, progress.unlockedTiers);
  assert.equal(battle.getCost('damage'), 8);
  assert.equal(UPGRADE_TIERS.offense[1].cost, 20);
});
