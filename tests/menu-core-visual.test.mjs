import test from 'node:test';
import assert from 'node:assert/strict';
import { MenuCoreVisual } from '../src/visuals/MenuCoreVisual.js';
import { RenderSystem } from '../src/systems/RenderSystem.js';
import { RenderComponent } from '../src/components/RenderComponent.js';
import { HealthComponent } from '../src/components/HealthComponent.js';

function context() {
  const calls = [], stack = [];
  const state = { globalAlpha: 1, shadowBlur: 0, angle: 0, calls,
    save() { stack.push({ globalAlpha: this.globalAlpha, shadowBlur: this.shadowBlur, angle: this.angle }); },
    restore() { Object.assign(this, stack.pop()); },
    rotate(value) { this.angle += value; },
    setTransform() { this.angle = 0; },
    createRadialGradient() { calls.push(['gradient']); return { addColorStop() {} }; },
    drawImage(canvas) { calls.push(['image', canvas, this.globalAlpha, this.angle]); }
  };
  return new Proxy(state, {
    get(target, key) { return target[key] ?? ((...args) => calls.push([key, ...args])); },
    set(target, key, value) { if (key === 'shadowBlur') calls.push(['blur', value]); target[key] = value; return true; }
  });
}
function setup() {
  const canvases = [];
  const visual = new MenuCoreVisual(() => {
    const ctx = context();
    const canvas = { width: 0, height: 0, getContext() { return ctx; } };
    canvases.push(canvas);
    return canvas;
  });
  const renderer = Object.create(RenderSystem.prototype);
  Object.assign(renderer, { corePulseAngle: 1, radarRotation: 2, spaceTime: 3 });
  const render = new RenderComponent('tower', 8, 26, '#00f3ff', '#00f3ff', 12);
  const health = new HealthComponent(300, 300);
  return { visual, canvases, renderer, render, health, ctx: context() };
}

test('steady menu frames reuse baked layers without paths, gradients, or live blur', () => {
  const { visual, canvases, renderer, render, health, ctx } = setup();
  const before = JSON.stringify([render, health]);
  visual.draw(ctx, renderer, render, health, 900, 900, 1);
  assert.equal(canvases.length, 7);
  const bakedOperations = [...visual.layers.values()].map(layer => layer.canvas.getContext().calls.length);
  assert.ok(bakedOperations.every(count => count > 0));
  assert.ok([...visual.layers.values()].some(layer => layer.canvas.getContext().calls.some(call => call[0] === 'gradient')));
  ctx.calls.length = 0;
  for (let frame = 0; frame < 100; frame++) {
    renderer.spaceTime += 1 / 320; renderer.radarRotation += 0.6 / 320; renderer.corePulseAngle += 2.5 / 320;
    visual.draw(ctx, renderer, render, health, 900, 900, 1);
  }
  assert.equal(canvases.length, 7);
  assert.deepEqual([...visual.layers.values()].map(layer => layer.canvas.getContext().calls.length), bakedOperations);
  assert.equal(ctx.calls.filter(call => call[0] === 'image').length, 700);
  assert.equal(ctx.calls.some(call => ['gradient', 'arc', 'stroke', 'fill', 'clip'].includes(call[0])), false);
  assert.equal(ctx.calls.some(call => call[0] === 'blur' && call[1] > 0), false);
  assert.equal(JSON.stringify([render, health]), before);
});

test('menu cache stays bounded at huge resolutions and reuses canvases on resize or style/HP changes', () => {
  const { visual, canvases, renderer, render, health, ctx } = setup();
  visual.draw(ctx, renderer, render, health, 8000, 8000, 2);
  assert.ok(canvases.every(canvas => canvas.width <= 640 && canvas.height <= 640));
  assert.ok(canvases.reduce((sum, canvas) => sum + canvas.width * canvas.height * 4, 0) < 8 * 1024 * 1024);
  const firstKey = visual.cacheKey;
  visual.draw(ctx, renderer, render, health, 330, 330, 1);
  assert.notEqual(visual.cacheKey, firstKey);
  assert.equal(canvases.length, 7);
  const smallKey = visual.cacheKey;
  health.current = 150;
  visual.draw(ctx, renderer, render, health, 330, 330, 1);
  assert.notEqual(visual.cacheKey, smallKey);
  const hurtKey = visual.cacheKey;
  render.color = '#ffaa00';
  visual.draw(ctx, renderer, render, health, 330, 330, 1);
  assert.notEqual(visual.cacheKey, hurtKey);
  assert.equal(canvases.length, 7);
});

test('cached radar layers counter-rotate independently of the fixed chassis and moving barrel', () => {
  const { visual, renderer, render, health, ctx } = setup();
  ctx.globalAlpha = 0.6; ctx.shadowBlur = 4;
  visual.draw(ctx, renderer, render, health, 500, 500, 1);
  const images = ctx.calls.filter(call => call[0] === 'image');
  assert.equal(images[0][3], 0);
  assert.equal(images[1][3], renderer.radarRotation * 40 / 130);
  assert.equal(images[2][3], -renderer.radarRotation * 25 / 125);
  assert.equal(images[3][3], renderer.radarRotation * 0.25);
  assert.equal(images[4][3], 0);
  assert.equal(images[5][2], 0.6 * (0.9 + Math.sin(renderer.corePulseAngle) * 0.1));
  assert.equal(images[6][3], -0.5 + Math.sin(renderer.spaceTime * 0.22) * 0.55);
  assert.equal(ctx.globalAlpha, 0.6);
  assert.equal(ctx.shadowBlur, 4);
});
