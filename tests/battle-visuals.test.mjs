import test from 'node:test';
import assert from 'node:assert/strict';
import { SpriteCache, RangeFieldVisual, TowerVisual, EnemyVisualCache, ProjectileVisualCache } from '../src/visuals/BattleVisualCache.js';
import { RenderSystem } from '../src/systems/RenderSystem.js';
import { GameConfig } from '../src/config/GameConfig.js';
import { RenderComponent } from '../src/components/RenderComponent.js';
import { HealthComponent } from '../src/components/HealthComponent.js';
import { World } from '../src/core/World.js';
import { EnemyComponent } from '../src/components/EnemyComponent.js';
import { TransformComponent } from '../src/components/TransformComponent.js';
import { EnemyIntelRenderer } from '../src/ui/UIManager.js';

function context() {
  const calls = [], stack = [];
  const state = { calls, globalAlpha: 1, shadowBlur: 0, angle: 0,
    save() { stack.push({ globalAlpha: this.globalAlpha, shadowBlur: this.shadowBlur, angle: this.angle }); },
    restore() { Object.assign(this, stack.pop()); },
    setTransform() { this.angle = 0; }, rotate(angle) { this.angle += angle; },
    createRadialGradient() { calls.push(['gradient']); return { addColorStop() {} }; },
    drawImage(...args) { calls.push(['image', this.globalAlpha, this.angle, ...args]); }
  };
  return new Proxy(state, { get: (target, key) => target[key] ?? ((...args) => calls.push([key, ...args])),
    set(target, key, value) { if (key === 'shadowBlur') calls.push(['blur', value]); target[key] = value; return true; } });
}
function setup() {
  const canvases = [];
  const createCanvas = () => { const ctx = context(); const canvas = { width: 0, height: 0, getContext: () => ctx }; canvases.push(canvas); return canvas; };
  const renderer = Object.create(RenderSystem.prototype);
  Object.assign(renderer, { corePulseAngle: 1, radarRotation: 2, canvas: { pixelRatio: 1 } });
  return { canvases, createCanvas, renderer, ctx: context() };
}
const noLiveBlur = ctx => assert.equal(ctx.calls.some(call => call[0] === 'blur' && call[1] > 0), false);

test('Architect database preview reuses the battle artwork with two cached blits per frame and no live glow', () => {
  const { createCanvas, renderer, ctx, canvases } = setup();
  const preview = Object.create(EnemyIntelRenderer.prototype);
  preview.architectVisualCache = new EnemyVisualCache(createCanvas);
  preview.architectPainter = renderer;
  preview._drawBossArchitect(ctx, 0);
  const count = canvases.length; ctx.calls.length = 0;
  for (let i = 0; i < 240; i++) preview._drawBossArchitect(ctx, i / 60);
  assert.equal(canvases.length, count); assert.equal(count, 2);
  assert.equal(ctx.calls.filter(c => c[0] === 'image').length, 480);
  assert.equal(ctx.calls.some(c => ['stroke', 'fill', 'gradient'].includes(c[0])), false);
  assert.ok(canvases.every(c => c.width <= 256 && c.height <= 256)); noLiveBlur(ctx);
});

test('all enemy types reuse sprites, retain Aegis attenuation, and animate boss cores without live geometry', () => {
  const { createCanvas, renderer, ctx, canvases } = setup();
  const cache = new EnemyVisualCache(createCanvas);
  for (const [type, cfg] of Object.entries(GameConfig.enemies)) {
    const render = new RenderComponent('polygon', cfg.sides, cfg.radius, cfg.color, cfg.glowColor, cfg.glowBlur);
    const before = JSON.stringify(render);
    for (const glow of [1, .5, .75]) cache.draw(ctx, renderer, type, render, glow, 1);
    const count = canvases.length;
    ctx.calls.length = 0;
    for (let frame = 0; frame < 5; frame++) { renderer.corePulseAngle += .1; cache.draw(ctx, renderer, type, render, .75, 1); }
    assert.equal(canvases.length, count, type);
    assert.equal(ctx.calls.filter(c => c[0] === 'image').length, type === 'boss_architect' ? 20 : 10);
    assert.equal(ctx.calls.some(c => ['arc', 'stroke', 'fill', 'gradient', 'clip'].includes(c[0])), false);
    noLiveBlur(ctx); assert.equal(JSON.stringify(render), before);
  }
  assert.ok(cache.cache.entries.size <= 64);
});

test('range field reuses four buffers, remains bounded at maximum range/DPR, and never paints live glow', () => {
  const { createCanvas, renderer, ctx, canvases } = setup();
  const cache = new RangeFieldVisual(createCanvas);
  cache.draw(ctx, renderer, 500, 400, 130, 1);
  const counts = canvases.map(c => c.getContext().calls.length);
  for (let i = 0; i < 50; i++) { renderer.radarRotation += .1; cache.draw(ctx, renderer, 500, 400, 130, 1); }
  assert.deepEqual(canvases.map(c => c.getContext().calls.length), counts);
  assert.equal(canvases.length, 4); noLiveBlur(ctx);
  cache.draw(ctx, renderer, 700, 450, 290, 3);
  assert.equal(canvases.length, 4);
  assert.ok(canvases.every(c => c.width <= 768 && c.height <= 768));
  assert.ok(canvases.reduce((sum, c) => sum + c.width * c.height * 4, 0) <= 9 * 1024 * 1024);
});

test('blending glow sprites preserves the intended body opacity at the Aegis edge', () => {
  const { createCanvas, renderer, ctx } = setup();
  const cache = new EnemyVisualCache(createCanvas);
  const cfg = GameConfig.enemies.fighter;
  const render = new RenderComponent('polygon', cfg.sides, cfg.radius, cfg.color, cfg.glowColor, cfg.glowBlur);
  ctx.globalAlpha = .875;
  cache.draw(ctx, renderer, 'fighter', render, .75, 1);
  const images = ctx.calls.filter(c => c[0] === 'image');
  const composedAlpha = images[0][1] * (1 - images[1][1]) + images[1][1];
  assert.ok(Math.abs(composedAlpha - .875) < 1e-12);
  assert.equal(ctx.globalAlpha, .875);
});

test('regeneration does not invalidate tower body, reactor or barrel caches', () => {
  const { createCanvas, renderer, ctx, canvases } = setup();
  const cache = new TowerVisual(createCanvas), health = new HealthComponent(300, 300);
  const render = new RenderComponent('tower', 8, 26, '#00f3ff', '#00f3ff', 14);
  cache.draw(ctx, renderer, render, health, 500, 400, 1, 1);
  const count = canvases.length;
  ctx.calls.length = 0;
  for (let i = 0; i < 100; i++) { health.current = 100 + i; renderer.corePulseAngle += .1; cache.draw(ctx, renderer, render, health, 500, 400, i / 30, 1); }
  assert.equal(canvases.length, count); noLiveBlur(ctx);
  assert.equal(ctx.calls.some(c => c[0] === 'gradient'), false);
});

test('sprite LRU never grows with entity IDs, style changes or repeated resolutions', () => {
  const { createCanvas, ctx } = setup();
  const cache = new SpriteCache(8, 128, createCanvas);
  for (let i = 0; i < 100; i++) cache.get(`style-${i}`, 100, 5, c => c.fillRect(0, 0, 10, 10));
  assert.equal(cache.entries.size, 8);
  assert.ok([...cache.entries.values()].every(s => s.canvas.width <= 128 && s.canvas.height <= 128));
  const s = cache.get('style-99', 100, 5, () => assert.fail('must hit cached sprite'));
  ctx.drawImage(s.canvas, 0, 0);
});

test('normal, critical, rapid-fire and sniper projectiles use bounded reusable sprites', () => {
  const { createCanvas, ctx, canvases } = setup();
  const cache = new ProjectileVisualCache(createCanvas);
  const variants = [
    [false, false, '#00f3ff', 10], [false, true, '#ffe600', 16],
    [false, false, '#ff9cec', 10], [true, false, '#ff7700', 10]
  ];
  for (const [isEnemy, isCrit, color, glow] of variants) {
    const render = new RenderComponent('projectile', 0, 4, color, color, glow);
    cache.draw(ctx, render, { isEnemy, isCrit }, 1);
    const count = canvases.length;
    for (let i = 0; i < 25; i++) cache.draw(ctx, render, { isEnemy, isCrit }, 1);
    assert.equal(canvases.length, count);
  }
  noLiveBlur(ctx); assert.equal(ctx.calls.some(c => c[0] === 'arc'), false);
});

test('offscreen body culling leaves entities intact and retains a dome extending into the viewport', () => {
  const { renderer, ctx } = setup();
  const world = new World(), id = world.createEntity();
  const enemy = new EnemyComponent('aegis'); enemy.shieldDomeRadius = 115;
  for (const c of [enemy, new TransformComponent(-100, 300), new HealthComponent(100, 100),
    new RenderComponent('polygon', 5, 19, '#00e5ff', '#00e5ff', 14)]) world.addComponent(id, c);
  let bodies = 0, domes = 0;
  renderer.enemyVisualCache = { draw() { bodies++; } };
  renderer.aegisShieldVisual = { draw() { domes++; } };
  renderer._drawEnemies(ctx, world); renderer._drawAegisDomes(ctx, world);
  assert.equal(bodies, 0); assert.equal(domes, 1);
  assert.equal(world.entityManager.activeEntities.size, 1); assert.equal(world.destructionQueue.size, 0);
});
