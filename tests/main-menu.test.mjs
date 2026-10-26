import test from 'node:test';
import assert from 'node:assert/strict';
import { UIManager } from '../src/ui/UIManager.js';
import { RenderSystem } from '../src/systems/RenderSystem.js';
import { World } from '../src/core/World.js';
import { TowerComponent } from '../src/components/TowerComponent.js';
import { TransformComponent } from '../src/components/TransformComponent.js';
import { RenderComponent } from '../src/components/RenderComponent.js';
import { HealthComponent } from '../src/components/HealthComponent.js';

function menuSetup() {
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) {
      const classes = new Set(['hidden']);
      nodes.set(id, { dataset: {}, attrs: {}, handlers: {}, hidden: true,
        classList: {
          add: name => classes.add(name), remove: name => classes.delete(name),
          contains: name => classes.has(name),
          toggle(name, force) { assert.equal(typeof force, 'boolean'); if (force) classes.add(name); else classes.delete(name); }
        },
        setAttribute(name, value) { this.attrs[name] = value; },
        appendChild(child) { child.parentElement = this; },
        addEventListener(name, callback) { this.handlers[name] = callback; }, focus() {}
      });
    }
    return nodes.get(id);
  };
  globalThis.document = { getElementById: node, addEventListener() {} };
  globalThis.window = { addEventListener() {} };
  const world = new World();
  Object.assign(world, { inMenu: true, isPaused: false, gameSpeed: 2 });
  const ui = new UIManager(world, null, null);
  ui.intelRenderer = { running: false, start() { this.running = true; }, stop() { this.running = false; } };
  ui.dom.menuHomeCoreSlot.appendChild(ui.dom.menuCoreDisplay);
  ui._bindEvents();
  ui.showMainMenu();
  return { ui, world };
}

test('menu navigation keeps one page active, stops hidden previews and never emits an upgrade or changes combat', () => {
  const { ui, world } = menuSetup();
  const events = [];
  for (const name of ['START_GAME', 'UPGRADE_PURCHASED', 'CREDITS_CHANGED']) world.eventBus.on(name, () => events.push(name));
  const assertPage = expected => {
    assert.equal(ui.activeMenuPage, expected);
    assert.equal(ui.dom.menuCoreDisplay.parentElement, ui.dom.menuHomeCoreSlot);
    for (const [key, panel] of [['home', ui.dom.menuPageHome], ['upgrades', ui.dom.menuPageUpgrades],
      ['settings', ui.dom.menuPageSettings], ['intel', ui.dom.modalIntel]]) {
      assert.equal(panel.classList.contains('hidden'), key !== expected && !(key === 'home' && expected === 'upgrades'));
    }
  };
  assertPage('home');
  ui.dom.btnMenuUpgrades.handlers.click(); assertPage('upgrades');
  ui.dom.metaTabs[1].button.handlers.click();
  assert.equal(ui.dom.metaTabs[1].button.attrs['aria-pressed'], 'true');
  assert.equal(ui.dom.metaTabs[0].panel.classList.contains('hidden'), true);
  ui.dom.btnMenuIntel.handlers.click(); assertPage('intel');
  assert.equal(ui.intelRenderer.running, true);
  ui.dom.btnMenuSettings.handlers.click(); assertPage('settings');
  assert.equal(ui.intelRenderer.running, false);
  ui._handleKeyDown({ key: 'Escape' }); assertPage('home');
  assert.deepEqual(events, []);
  assert.equal(world.gameSpeed, 2);
  assert.equal(world.isPaused, false);
  ui.dom.btnMenuStart.handlers.click();
  assert.deepEqual(events, ['START_GAME']);
  ui.openIntel(); ui.hideMainMenu();
  assert.equal(ui.intelRenderer.running, false);
  ui.showMainMenu(); assertPage('home');
});

test('main menu and pause menu share one FPS setting', () => {
  const { ui } = menuSetup();
  ui.dom.menuBtnFps.handlers.click();
  assert.equal(ui.dom.btnFps.attrs['aria-pressed'], 'true');
  assert.equal(ui.dom.menuBtnFps.attrs['aria-pressed'], 'true');
  assert.equal(ui.dom.menuFpsState.textContent, 'ВКЛ');
  ui.dom.btnFps.handlers.click();
  assert.equal(ui.dom.menuBtnFps.attrs['aria-pressed'], 'false');
  assert.equal(ui.dom.menuFpsState.textContent, 'ВЫКЛ');
});

test('tower showcase is independent of combat position, health and aim, and skips hidden pages', () => {
  const world = new World();
  const id = world.createEntity();
  const transform = new TransformComponent(700, 400, 1.8);
  const health = new HealthComponent(200, 300);
  const visual = new RenderComponent('tower', 8, 26);
  for (const component of [new TowerComponent(), transform, health, visual]) world.addComponent(id, component);
  const before = JSON.stringify([transform, health, visual]);
  let draws = 0;
  const ctx = Object.fromEntries(['setTransform', 'clearRect', 'save', 'translate', 'scale', 'restore'].map(key => [key, () => {}]));
  const renderer = Object.create(RenderSystem.prototype);
  Object.assign(renderer, { canvas: { pixelRatio: 2 }, menuCanvas: { clientWidth: 400, clientHeight: 300 }, menuCtx: ctx,
    menuCoreVisual: { draw(context, system, render, hp, width, height, ratio) {
      draws++; assert.equal(render, visual); assert.equal(hp, health);
      assert.equal(width, system.menuCanvas.clientWidth); assert.equal(height, system.menuCanvas.clientHeight);
      assert.ok(ratio <= 1.5); assert.ok(Math.max(width, height) * ratio <= 900);
    } } });
  renderer._drawMenuCore(world);
  assert.equal(renderer.menuCanvas.width, 600);
  assert.equal(renderer.menuCanvas.height, 450);
  renderer.menuCanvas.clientWidth = 0;
  renderer._drawMenuCore(world);
  assert.equal(draws, 1);
  renderer.menuCanvas.clientWidth = 8000;
  renderer.menuCanvas.clientHeight = 6000;
  renderer._drawMenuCore(world);
  assert.equal(renderer.menuCanvas.width, 900);
  assert.equal(renderer.menuCanvas.height, 675);
  assert.equal(draws, 2);
  assert.equal(JSON.stringify([transform, health, visual]), before);
});
