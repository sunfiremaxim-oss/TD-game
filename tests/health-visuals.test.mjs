import test from 'node:test';
import assert from 'node:assert/strict';
import { getHealthRatio, getHealthColor } from '../src/visuals/HealthVisuals.js';
import { UIManager } from '../src/ui/UIManager.js';
import { RenderSystem } from '../src/systems/RenderSystem.js';
import { World } from '../src/core/World.js';
import { TowerComponent } from '../src/components/TowerComponent.js';
import { TransformComponent } from '../src/components/TransformComponent.js';
import { AttackComponent } from '../src/components/AttackComponent.js';
import { RenderComponent } from '../src/components/RenderComponent.js';
import { HealthComponent } from '../src/components/HealthComponent.js';

test('health ratio clamps damage, overhealing and invalid maximums', () => {
  for (const [current, max, expected] of [[300, 300, 1], [150, 300, 0.5],
    [-30, 300, 0], [400, 300, 1], [1, 0, 0], [1, -10, 0], [NaN, 300, 0]]) {
    assert.equal(getHealthRatio(current, max), expected);
  }
});

test('health colors blend continuously through green, yellow and red', () => {
  assert.equal(getHealthColor(1), 'rgb(52, 217, 133)');
  assert.equal(getHealthColor(0.5), 'rgb(244, 207, 68)');
  assert.equal(getHealthColor(0), 'rgb(240, 66, 82)');
  assert.equal(getHealthColor(0.75), 'rgb(148, 212, 101)');
  assert.equal(getHealthColor(0.25), 'rgb(242, 137, 75)');
  for (let i = 1; i <= 1000; i++) {
    const rgb = value => getHealthColor(value).match(/\d+/g).map(Number);
    const before = rgb((i - 1) / 1000);
    const after = rgb(i / 1000);
    assert.ok(after.every((value, channel) => Math.abs(value - before[channel]) <= 1));
  }
});

test('HUD updates width and color on damage, regeneration and maximum health changes', () => {
  const ui = Object.create(UIManager.prototype);
  let writes = 0;
  ui.dom = { hpBarFill: { style: new Proxy({}, {
    set(target, key, value) { writes++; target[key] = value; return true; }
  }) }, hpText: {} };
  for (const [current, max, width, ratio] of [[300, 300, '100.0%', 1],
    [150, 300, '50.0%', 0.5], [75, 300, '25.0%', 0.25],
    [225, 300, '75.0%', 0.75], [225, 450, '50.0%', 0.5]]) {
    ui._updateHealthHUD({ current, max, regenRate: 1 });
    assert.equal(ui.dom.hpBarFill.style.width, width);
    assert.equal(ui.dom.hpBarFill.style.backgroundColor, getHealthColor(ratio));
    assert.match(ui.dom.hpText.innerHTML, new RegExp(`<strong>${current}</strong> / ${max}`));
  }
  const previousWrites = writes;
  ui._updateHealthHUD({ current: 225, max: 450, regenRate: 1 });
  assert.equal(writes, previousWrites, 'unchanged health must not rewrite DOM styles');
});

function recordingContext() {
  const strokes = [];
  let path = [];
  const ctx = { save() {}, restore() {}, beginPath() { path = []; },
    arc(...args) { path.push(args); },
    stroke() { strokes.push({ color: this.strokeStyle, width: this.lineWidth, arcs: [...path] }); } };
  return { ctx, strokes };
}

test('inset ring drains clockwise with a partial last cell and retains empty cells', () => {
  const render = Object.create(RenderSystem.prototype);
  for (const ratio of [0, 0.01, 0.25, 0.51, 1]) {
    const { ctx, strokes } = recordingContext();
    render._drawTowerHealthRing(ctx, 26, { current: ratio * 300, max: 300 });
    const empty = strokes.filter(stroke => stroke.color === '#1c333d');
    const lit = strokes.filter(stroke => stroke.color === getHealthColor(ratio));
    assert.equal(empty.length, 24);
    assert.equal(lit.length, Math.ceil(ratio * 24));
    const span = Math.PI * 2 / 24 - 0.055;
    const litSpan = lit.reduce((sum, stroke) => sum + stroke.arcs[0][4] - stroke.arcs[0][3], 0);
    assert.ok(Math.abs(litSpan - ratio * 24 * span) < 1e-9);
    assert.ok(strokes.every(stroke => stroke.arcs.every(arc => arc[2] + stroke.width / 2 < 26)));
    if (lit.length) assert.ok(Math.abs(lit[0].arcs[0][3] - (-Math.PI / 2 + 0.055 / 2)) < 1e-9);
  }
});

test('chassis health and reactor render beneath the rotating barrel', () => {
  const world = new World();
  const tower = world.createEntity();
  for (const component of [new TowerComponent(), new TransformComponent(100, 100),
    new AttackComponent(), new RenderComponent('tower', 8, 26), new HealthComponent(150, 300)]) {
    world.addComponent(tower, component);
  }
  const render = Object.create(RenderSystem.prototype);
  const order = [];
  render._drawRangeField = render._drawPolygonPath = () => {};
  render._drawTowerHealthRing = () => order.push('health');
  render._drawReactorCore = () => order.push('reactor');
  const ctx = new Proxy({}, { get(target, key) {
    return target[key] ?? ((...args) => { if (key === 'rotate' || key === 'fillRect') order.push(key); });
  } });
  render._drawTowerAndRange(ctx, world);
  assert.deepEqual(order.slice(0, 3), ['health', 'reactor', 'rotate']);
  assert.ok(order.indexOf('fillRect') > order.indexOf('health'));
});
