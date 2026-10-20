import test from 'node:test';
import assert from 'node:assert/strict';
import { UIManager } from '../src/ui/UIManager.js';

function setup() {
  const nodes = new Map();
  const document = {
    hidden: false,
    getElementById(id) {
      if (!nodes.has(id)) nodes.set(id, { textContent: '', hidden: false, attributes: {}, setAttribute(key, value) { this.attributes[key] = value; } });
      return nodes.get(id);
    }
  };
  globalThis.document = document;
  return { ui: new UIManager({}, null, null), document };
}

test('FPS toggle reveals and hides the counter and clears stale samples', () => {
  const { ui } = setup();
  assert.equal(ui.fpsEnabled, false);
  ui.toggleFps();
  assert.equal(ui.dom.fpsCounter.hidden, false);
  assert.equal(ui.dom.btnFps.attributes['aria-pressed'], 'true');
  ui.updateFps(0);
  ui.updateFps(500);
  ui.toggleFps();
  assert.equal(ui.dom.fpsCounter.hidden, true);
  assert.equal(ui.dom.btnFps.attributes['aria-pressed'], 'false');
  ui.toggleFps();
  assert.equal(ui.dom.fpsCounter.textContent, '— FPS · — мс');
  assert.equal(ui._fpsLastTime, null);
});

for (const fps of [30, 60, 120]) {
  test(`measures ${fps} FPS from frame timestamps independently of game speed and pause`, () => {
    const { ui } = setup();
    ui.world.gameSpeed = 3;
    ui.world.isPaused = true;
    ui.toggleFps();
    for (let frame = 0; frame <= fps; frame++) ui.updateFps(frame * 1000 / fps);
    assert.equal(ui.dom.fpsCounter.textContent, `${fps} FPS · ${(1000 / fps).toFixed(1)} мс`);
  });
}

test('low frame rates use actual time instead of clamped gameplay delta', () => {
  const { ui } = setup();
  ui.toggleFps();
  ui.updateFps(0);
  ui.updateFps(250);
  ui.updateFps(500);
  assert.equal(ui.dom.fpsCounter.textContent, '4 FPS · 250.0 мс');
});

test('visibility changes exclude time spent in a background tab', () => {
  const { ui, document } = setup();
  ui.toggleFps();
  ui.updateFps(0);
  ui.updateFps(100);
  document.hidden = true;
  ui._boundFpsVisibility();
  document.hidden = false;
  ui._boundFpsVisibility();
  for (let frame = 0; frame <= 31; frame++) ui.updateFps(60000 + frame * 1000 / 60);
  assert.equal(ui.dom.fpsCounter.textContent, '60 FPS · 16.7 мс');
});
