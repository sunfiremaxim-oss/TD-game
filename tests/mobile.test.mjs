import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { World } from '../src/core/World.js';
import { TransformComponent } from '../src/components/TransformComponent.js';
import { TowerComponent } from '../src/components/TowerComponent.js';
import { UIManager } from '../src/ui/UIManager.js';

const sourceUrl = new URL('../src/main.js', import.meta.url);
const source = await readFile(sourceUrl, 'utf8');
const imports = {};
for (const match of source.matchAll(/import\s+\{([^}]+)\}\s+from\s+'([^']+)';/g)) {
  const module = await import(new URL(match[2], sourceUrl));
  for (const name of match[1].split(',').map(value => value.trim())) imports[name] = module[name];
}
function appSetup() {
  const wrapper = { clientWidth: 390, clientHeight: 650 };
  const document = { hidden: false, readyState: 'loading', getElementById: () => wrapper };
  const window = { devicePixelRatio: 3, addEventListener() {} };
  const context = vm.createContext({ ...imports, document, window, performance });
  vm.runInContext(source.replace(/import\s+[^;]+;\s*/g, '') + '\nthis.GameApp = GameApp;', context);
  const app = Object.create(context.GameApp.prototype);
  Object.assign(app, { canvas: {}, world: new World(), gameState: 'PLAYING' });
  return { app, wrapper, document, window };
}

test('phone rotation, viewport changes and tablet resize keep the tower centered and the world finite', () => {
  const { app, wrapper } = appSetup();
  const tower = app.world.createEntity();
  app.world.addComponent(tower, new TowerComponent());
  app.world.addComponent(tower, new TransformComponent(600, 400));
  const enemy = app.world.createEntity();
  app.world.addComponent(enemy, new TransformComponent(900, 300));
  for (const [width, height] of [[320, 380], [390, 650], [390, 430], [740, 285], [510, 285], [768, 930], [1024, 660], [1200, 800]]) {
    wrapper.clientWidth = width;
    wrapper.clientHeight = height;
    app._resizeCanvas();
    const trans = app.world.getComponent(tower, TransformComponent);
    assert.equal(trans.x, app.world.width / 2);
    assert.equal(trans.y, app.world.height / 2);
    assert.ok(Math.min(app.world.width, app.world.height) >= 639.99);
    const enemyTrans = app.world.getComponent(enemy, TransformComponent);
    assert.ok(Number.isFinite(enemyTrans.x) && Number.isFinite(enemyTrans.y));
    assert.ok(Math.abs(enemyTrans.x / app.world.width - 0.75) < 1e-9);
    assert.ok(Math.abs(enemyTrans.y / app.world.height - 0.375) < 1e-9);
  }
});

test('Retina backing buffers improve sharpness without changing gameplay coordinates', () => {
  const { app, window } = appSetup();
  window.devicePixelRatio = 3;
  app._resizeCanvas();
  const logicalWidth = app.world.width;
  assert.equal(app.canvas.pixelRatio, 2);
  assert.equal(app.canvas.width, 780);
  assert.equal(app.canvas.viewportWidth, 390);
  window.devicePixelRatio = 1;
  app._resizeCanvas();
  assert.equal(app.world.width, logicalWidth);
  assert.equal(app.canvas.width, 390);
});

test('hidden containers do not reset the world or canvas to fallback sizes', () => {
  const { app, wrapper } = appSetup();
  app._resizeCanvas();
  const width = app.world.width;
  const buffer = app.canvas.width;
  wrapper.clientWidth = 0;
  app._resizeCanvas();
  assert.equal(app.world.width, width);
  assert.equal(app.canvas.width, buffer);
});

test('restart resets new combat stats, temporary rapid fire, lifesteal budget and free upgrade wave state', () => {
  const { app } = appSetup();
  app.upgradeManager = new imports.UpgradeManager();
  const tower = app._createTowerEntity();
  const health = app.world.getComponent(tower, imports.HealthComponent);
  assert.equal(health.max, 300);
  assert.equal(health.current, 300);
  app.upgradeManager.levels.set('maxHealth', 3);
  for (const id of ['ricochetChance', 'rapidFireChance', 'lifeSteal', 'damageReflection', 'knockbackChance', 'freeAttackChance', 'crystalDropChance', 'crystalWaveBonus']) {
    app.upgradeManager.levels.set(id, 2);
  }
  app.upgradeManager.applyAll(app.world, tower);
  const attack = app.world.getComponent(tower, imports.AttackComponent);
  attack.rapidFireRemaining = 1;
  attack.aimHoldRemaining = 0.05;
  app.world.getComponent(tower, imports.DefenseComponent).lifeStealBudget = 9;
  app.upgradeManager._lastFreeWave = 20;
  health.current = 1;
  const economy = app.world.getComponent(tower, imports.EconomyComponent);
  Object.assign(economy, { runCrystals: 15, lastCrystalRewardWave: 20, crystalsSettled: true });
  app.upgradeManager.reset();
  app._resetTowerStats();
  assert.equal(health.max, 300);
  assert.equal(health.current, 300);
  assert.equal(attack.ricochetChance, 0);
  assert.equal(attack.rapidFireChance, 0);
  assert.equal(attack.rapidFireRemaining, 0);
  assert.equal(attack.aimHoldRemaining, 0);
  assert.equal(attack.rapidFireDuration, 0.5);
  assert.equal(app.world.getComponent(tower, imports.DefenseComponent).lifeSteal, 0);
  assert.equal(app.world.getComponent(tower, imports.DefenseComponent).lifeStealBudget, 0);
  assert.equal(app.upgradeManager._lastFreeWave, 0);
  assert.equal(economy.runCrystals, 0); assert.equal(economy.lastCrystalRewardWave, 0);
  assert.equal(economy.crystalsSettled, false); assert.equal(economy.crystalDropChance, .01);
  assert.equal(economy.crystalWaveMultiplier, 1);
});

test('game restart and return restore permanent health and levels; start applies newly purchased levels', () => {
  const { app } = appSetup();
  app.playerProgress = { upgrades: { damage: 2, maxHealth: 1 }, isStageUnlocked: id => id === 1 };
  app.upgradeManager = new imports.UpgradeManager(app.playerProgress.upgrades);
  const tower = app._createTowerEntity();
  const attack = app.world.getComponent(tower, imports.AttackComponent);
  const health = app.world.getComponent(tower, imports.HealthComponent);
  app.waveSystem = { reset() {}, startFirstWave() {} };
  app.particleSystem = { reset() {} };
  app.audioSystem = { restartBGM() {}, pauseBGM() {}, unlockAudio() {} };
  app.uiManager = { reset() {}, hideMainMenu() {}, showMainMenu() {}, updateHUD() {}, renderUpgrades() {}, setGameSpeed() {} };
  app.upgradeManager.levels.set('damage', 5); health.current = 1;
  app.restartGame();
  assert.equal(attack.damage, 37); assert.equal(app.upgradeManager.getLevel('damage'), 2);
  assert.equal(health.current, 380); assert.equal(health.max, 380);
  app.upgradeManager.levels.set('damage', 7);
  app.returnToMenu();
  assert.equal(attack.damage, 37); assert.equal(app.world.inMenu, true);
  app.playerProgress.upgrades.damage = 3;
  app.startGame();
  assert.equal(attack.damage, 43); assert.equal(app.upgradeManager.getLevel('damage'), 3);
  assert.equal(app.world.getComponent(tower, imports.EconomyComponent).credits, 0);
});

test('backgrounding pauses active gameplay once and never automatically unpauses', () => {
  const { app, document } = appSetup();
  let toggles = 0;
  app.uiManager = { togglePause() { toggles++; app.world.isPaused = !app.world.isPaused; } };
  document.hidden = true;
  app._handleVisibilityChange();
  app._handleVisibilityChange();
  assert.equal(app.world.isPaused, true);
  assert.equal(toggles, 1);
  document.hidden = false;
  app._handleVisibilityChange();
  assert.equal(app.world.isPaused, true);
});

test('campaign start refuses locked stages and replay restarts the same stage even after the next stage is selected', () => {
  const { app } = appSetup();
  app.playerProgress = { upgrades: {}, isStageUnlocked: id => id >= 1 && id <= 3 };
  app.upgradeManager = new imports.UpgradeManager(); app._createTowerEntity();
  const started = [];
  app.waveSystem = { reset() {}, startFirstWave(world, id) { world.stageId = id; world.runOutcome = null; started.push(id); } };
  app.particleSystem = { reset() {} };
  app.audioSystem = { restartBGM() {}, pauseBGM() {}, unlockAudio() {} };
  app.uiManager = { selectedStage: 3, reset() {}, hideMainMenu() {}, showMainMenu() {}, updateHUD() {}, renderUpgrades() {}, setGameSpeed() {} };
  app.startGame(); assert.deepEqual(started, [3]);
  app.world.runOutcome = 'victory'; app.world.isGameOver = true; app.uiManager.selectedStage = 4;
  app.restartGame(); assert.deepEqual(started, [3, 3]); assert.equal(app.world.runOutcome, null);
  app.returnToMenu(); assert.equal(app.world.stageId, null);
  app.startGame(); assert.deepEqual(started, [3, 3]); assert.equal(app.world.inMenu, true);
});

test('ad resume cannot unpause a finished stage or a defeat', () => {
  const { app } = appSetup();
  app.audioSystem = { resumeAfterAd() {} };
  app.uiManager = { _updatePauseButton() {} };
  for (const outcome of ['victory', null]) {
    app.world.isGameOver = true; app.world.isPaused = true; app.world.runOutcome = outcome;
    app.resumeAfterAd(); assert.equal(app.world.isPaused, true);
  }
});

test('closing or reloading warns only about unpaid crystals in an unfinished run', () => {
  const { app } = appSetup();
  const id = app.world.createEntity(), economy = new imports.EconomyComponent();
  app.world.addComponent(id, new TowerComponent()); app.world.addComponent(id, economy);
  let warnings = 0;
  const event = { preventDefault() { warnings++; } };
  app._handleBeforeUnload(event); assert.equal(warnings, 0);
  economy.runCrystals = 9; app._handleBeforeUnload(event); assert.equal(warnings, 1);
  assert.equal(event.returnValue, '');
  economy.crystalsSettled = true; app._handleBeforeUnload(event); assert.equal(warnings, 1);
  economy.crystalsSettled = false; app.world.isGameOver = true; app._handleBeforeUnload(event);
  assert.equal(warnings, 1);
  app.world.isGameOver = false; app.gameState = 'MENU'; app._handleBeforeUnload(event);
  assert.equal(warnings, 1);
});

test('native mobile selects do not trigger gameplay keyboard shortcuts', () => {
  const ui = Object.create(UIManager.prototype);
  ui._handleKeyDown({ target: { tagName: 'SELECT' }, key: '3' });
});

test('speed shortcuts update the readout and button limits when resuming from pause', () => {
  const ui = Object.create(UIManager.prototype);
  const world = new World();
  world.isPaused = true;
  ui.world = world;
  ui.dom = { speedValue: {}, btnSpeedDown: {}, btnSpeedUp: {} };
  ui.setGameSpeed(3);
  assert.equal(world.gameSpeed, 3);
  assert.equal(world.isPaused, false);
  assert.equal(ui.dom.speedValue.textContent, '3.0×');
  assert.equal(ui.dom.btnSpeedUp.disabled, true);
  assert.equal(ui.dom.btnSpeedDown.disabled, false);
});

test('minus and plus step between available speeds, clamp at limits and preserve pause', () => {
  const ui = Object.create(UIManager.prototype);
  ui.world = new World();
  ui.world.isPaused = true;
  ui.dom = { speedValue: {}, btnSpeedDown: {}, btnSpeedUp: {} };
  for (const [direction, speed] of [[-1, 1], [1, 2], [1, 3], [1, 3], [-1, 2], [-1, 1]]) {
    ui.stepGameSpeed(direction);
    assert.equal(ui.world.gameSpeed, speed);
    assert.equal(ui.dom.speedValue.textContent, `${speed.toFixed(1)}×`);
    assert.equal(ui.dom.btnSpeedDown.disabled, speed === 1);
    assert.equal(ui.dom.btnSpeedUp.disabled, speed === 3);
    assert.equal(ui.world.isPaused, true);
  }
  ui.world.isPaused = false;
  ui.stepGameSpeed(1);
  assert.equal(ui.world.isPaused, false);
});

test('Space on a focused speed button leaves pause control to the button action', () => {
  const ui = Object.create(UIManager.prototype);
  ui.world = new World();
  ui.world.isPaused = true;
  ui._handleKeyDown({ target: { tagName: 'BUTTON' }, key: ' ', code: 'Space',
    preventDefault() { assert.fail('native button activation must remain enabled'); } });
  assert.equal(ui.world.isPaused, true);
});

test('Retina rendering uses CSS viewport dimensions for both the background and pause overlay', async () => {
  const { RenderSystem } = await import('../src/systems/RenderSystem.js');
  const render = Object.create(RenderSystem.prototype);
  const transforms = [];
  render.canvas = { width: 780, height: 1300, viewportWidth: 390, viewportHeight: 650, pixelRatio: 2 };
  render.ctx = { setTransform(...args) { transforms.push(args); }, save() {}, scale() {}, restore() {} };
  render.particleSystem = null;
  for (const method of ['_drawTacticalGrids', '_drawTowerAndRange', '_drawAegisDomes', '_drawEnemies', '_drawProjectiles']) render[method] = () => {};
  let background, pause;
  render._drawSpaceBackground = (ctx, width, height) => { background = [width, height]; };
  render._drawPauseOverlay = (ctx, width, height) => { pause = [width, height]; };
  const world = new World();
  world.isPaused = true;
  world.renderScale = 390 / 640;
  render.update(world, 0);
  assert.deepEqual(background, [390, 650]);
  assert.deepEqual(pause, [390, 650]);
  assert.deepEqual(transforms, [[2, 0, 0, 2, 0, 0]]);
});
