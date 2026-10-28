import test from 'node:test';
import assert from 'node:assert/strict';
import { UIManager, COMPACT_BATTLE_QUERY } from '../src/ui/UIManager.js';
import { World } from '../src/core/World.js';
import { UpgradeManager } from '../src/managers/UpgradeManager.js';
import { EconomySystem } from '../src/systems/EconomySystem.js';
import { TowerComponent } from '../src/components/TowerComponent.js';
import { EconomyComponent } from '../src/components/EconomyComponent.js';
import { AttackComponent } from '../src/components/AttackComponent.js';
import { ParticleSystem } from '../src/systems/ParticleSystem.js';

test('simultaneous chip and credit rewards remain on separate rows throughout their animation', () => {
  for (const step of [1 / 30, 1 / 60, 3 / 60]) {
    const world = new World(), particles = new ParticleSystem();
    particles.init(world);
    world.eventBus.emit('RUN_CRYSTALS_CHANGED', { source: 'kill', earned: 1, x: 200, y: 200 });
    world.eventBus.emit('CREDITS_CHANGED', { source: 'kill', earned: 50, x: 200, y: 200 });
    const [chip, credits] = particles.floatingTexts;
    assert.equal(chip.text, '+1'); assert.equal(chip.icon, 'microchip');
    assert.equal(credits.text, '+50 ◈');
    for (let elapsed = 0; elapsed < 1; elapsed += step) {
      assert.ok(credits.y - chip.y >= 35.99, 'reward rows must not converge at any game speed');
      particles.update(world, step);
    }
  }
});

test('successful paid and free levels replay confirmation on the existing card, failed buys do not', () => {
  const world = new World();
  const tower = world.createEntity();
  const economy = new EconomyComponent(5);
  for (const component of [new TowerComponent(), economy, new AttackComponent()]) world.addComponent(tower, component);
  world.registerSystem(new EconomySystem());
  const manager = new UpgradeManager();
  manager.init(world);
  const classes = new Set();
  let flashes = 0, layouts = 0;
  const card = {
    classList: { remove: name => classes.delete(name), add(name) { classes.add(name); flashes++; } },
    get offsetWidth() { layouts++; return 150; }
  };
  const ui = Object.create(UIManager.prototype);
  Object.assign(ui, { world, dom: {}, upgradeCardsMap: new Map([['damage', { cardEl: card }]]),
    updateHUD() {}, updateUpgradeCards() { card.disabled = economy.credits < manager.getCost('damage'); } });
  ui._subscribeWorldEvents();
  assert.equal(manager.buyUpgrade('damage', world), true);
  assert.equal(card.disabled, true, 'purchase feedback must survive the newly unaffordable state');
  assert.ok(classes.has('purchase-feedback'));
  assert.equal(flashes, 1);
  assert.equal(manager.buyUpgrade('damage', world), false);
  assert.equal(flashes, 1, 'failed purchases cannot show success');
  economy.credits = 100;
  assert.equal(manager.buyUpgrade('damage', world), true);
  assert.equal(flashes, 2, 'a rapid repeat must restart the visual cue');
  manager._grantLevel('damage', world, tower, 0, true);
  assert.equal(flashes, 3, 'visible free upgrades also receive confirmation');
  ui._showUpgradeFeedback('range');
  assert.equal(flashes, 3, 'hidden categories do not flash unrelated cards');
  assert.equal(layouts, 3);
  assert.equal(ui.upgradeCardsMap.get('damage').cardEl, card);
});

test('resizing moves the same speed controls and target panel between slots and cleans up its listener', () => {
  let changes, listenerCount = 0, moves = 0;
  const query = {
    matches: true,
    addEventListener(type, callback) { assert.equal(type, 'change'); changes = callback; listenerCount++; },
    removeEventListener(type, callback) { assert.equal(callback, changes); listenerCount--; }
  };
  globalThis.window = { matchMedia(text) { assert.equal(text, COMPACT_BATTLE_QUERY); return query; }, removeEventListener() {} };
  globalThis.document = { removeEventListener() {} };
  const controls = { parentElement: null };
  const slot = () => ({ appendChild(child) { moves++; child.parentElement = this; } });
  const arena = slot(), mobile = slot();
  const target = { parentElement: null, hidden: false }, desktopTarget = slot(), mobileTarget = slot();
  const ui = Object.create(UIManager.prototype);
  Object.assign(ui, { dom: { speedControls: controls, arenaSpeedSlot: arena, mobileSpeedSlot: mobile,
    targetInfo: target, desktopTargetSlot: desktopTarget, mobileTargetSlot: mobileTarget },
    world: { gameSpeed: 2, isPaused: true }, closeVolumePopover() {} });
  ui._setupResponsiveSpeedControls();
  assert.equal(controls.parentElement, mobile);
  assert.equal(target.parentElement, mobileTarget);
  ui._setupResponsiveSpeedControls();
  assert.equal(listenerCount, 1);
  changes();
  assert.equal(moves, 2, 'unchanged layout does not move or clone controls or target');
  query.matches = false; changes();
  assert.equal(controls.parentElement, arena);
  assert.equal(target.parentElement, desktopTarget);
  query.matches = true; changes();
  assert.equal(controls.parentElement, mobile);
  assert.equal(target.parentElement, mobileTarget);
  assert.equal(target.hidden, false, 'resizing preserves the visible target and cached references');
  assert.deepEqual(ui.world, { gameSpeed: 2, isPaused: true });
  assert.equal(ui.dom.speedControls, controls);
  ui.destroy();
  assert.equal(listenerCount, 0);
});
