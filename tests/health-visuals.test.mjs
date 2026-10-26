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
import { EnemyComponent } from '../src/components/EnemyComponent.js';
import { drawBossHullHealth } from '../src/visuals/BossHealthVisual.js';

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

test('boss hull cells show the exact health fraction and follow opening plates without live glow', () => {
  function paint(type, ratio, open = 0) {
    const strokes = [], moves = [], stack = []; let path = [];
    const ctx = { shadowBlur: 0, save() { stack.push(this.shadowBlur); }, restore() { this.shadowBlur = stack.pop(); },
      rotate() {}, scale() {}, translate(x,y) { moves.push([x,y]); },
      beginPath() { path = []; }, moveTo(x,y) { path.push([x,y]); },
      lineTo(x,y) { const p = path.at(-1); path.push([x,y]); this.length += Math.hypot(x-p[0],y-p[1]); },
      stroke() { strokes.push({ length: this.length, color: this.strokeStyle, blur: this.shadowBlur }); this.length = 0; }, length: 0 };
    drawBossHullHealth(ctx, type, { radius: 66 }, { current: ratio * 1000, max: 1000 }, open);
    return { strokes, moves, length: strokes.reduce((sum, s) => sum + s.length, 0) };
  }
  for (const type of ['boss_architect', 'boss_carrier', 'boss_scout', 'boss_railgun']) {
    const full = paint(type, 1);
    for (const ratio of [0, .01, .25, .51, .75, 1]) {
      const drawn = paint(type, ratio);
      assert.ok(Math.abs(drawn.length - full.length * ratio) < 1e-8);
      assert.ok(drawn.strokes.every(s => s.color === getHealthColor(ratio) && s.blur === 0));
      assert.ok(drawn.strokes.length <= (type === 'boss_architect' ? 4 : type === 'boss_scout' ? 3 : 2));
    }
  }
  const opened = paint('boss_architect', .5, 1);
  assert.deepEqual(opened.moves, Array.from({ length: 4 }, () => [0, -66 * .32]));
  assert.equal(opened.length, paint('boss_architect', .5).length);
});

test('all boss types use hull health instead of external bars, while regular enemies retain their damaged HP bar', () => {
  const world = new World(), renderer = Object.create(RenderSystem.prototype), hulls = [], bars = [];
  for (const [i, type] of ['boss_architect', 'boss_carrier', 'boss_scout', 'boss_railgun', 'scout'].entries()) {
    const id = world.createEntity();
    for (const c of [new EnemyComponent(type), new TransformComponent(100 + i * 100,100),
      new RenderComponent('polygon', 4, 30), new HealthComponent(50,100)]) world.addComponent(id,c);
  }
  renderer._drawEnemyBody = () => {};
  renderer._drawBossHullHealth = (_ctx,type,_render,health) => hulls.push([type,health.current,health.max]);
  renderer._drawHealthBar = () => bars.push('regular');
  renderer._drawBossHealthBar = () => { throw Error('external boss health bar is forbidden'); };
  const ctx = { globalAlpha: 1, save() {}, restore() {}, translate() {}, rotate() {} };
  renderer._drawEnemies(ctx,world);
  assert.deepEqual(hulls, [['boss_architect',50,100],['boss_carrier',50,100],['boss_scout',50,100],['boss_railgun',50,100]]);
  assert.deepEqual(bars, ['regular']);
});
