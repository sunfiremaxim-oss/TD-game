import test from 'node:test';
import assert from 'node:assert/strict';
import { RenderSystem } from '../src/systems/RenderSystem.js';
import { SpaceVisualCache } from '../src/visuals/SpaceVisualCache.js';

function context() {
  const calls = [], stack = [];
  const state = { calls, globalAlpha: 1, shadowBlur: 0,
    save() { stack.push({ globalAlpha: this.globalAlpha, shadowBlur: this.shadowBlur }); },
    restore() { Object.assign(this, stack.pop()); },
    createRadialGradient(...args) { calls.push(['gradient', ...args]); return { addColorStop(...stop) { calls.push(['stop', ...stop]); } }; },
    drawImage(...args) { calls.push(['image', this.globalAlpha, ...args]); }
  };
  return new Proxy(state, {
    get: (target, key) => target[key] ?? ((...args) => calls.push([key, ...args])),
    set(target, key, value) { if (key === 'shadowBlur') calls.push(['blur', value]); target[key] = value; return true; }
  });
}
function setup() {
  const renderer = Object.create(RenderSystem.prototype);
  renderer.canvas = { pixelRatio: 1 };
  renderer._initParallaxSpace();
  const canvases = [], paths = [], ctx = context();
  renderer.spaceVisualCache = new SpaceVisualCache(() => {
    const canvas = { width: 0, height: 0 }, c = context();
    canvas.getContext = () => c; canvases.push(canvas); return canvas;
  }, () => {
    const path = { points: [], moveTo(...p) { this.points.push(p); }, lineTo(...p) { this.points.push(p); } };
    paths.push(path); return path;
  });
  const draw = (width = 1200, height = 800, scale = 1) => renderer._drawSpaceBackground(ctx, width, height, { renderScale: scale });
  return { renderer, ctx, canvases, paths, draw };
}

test('space animation reuses all artwork and coordinates without live gradients, arcs or glow', () => {
  const { renderer, ctx, canvases, draw } = setup();
  draw();
  assert.equal(canvases.length, 65);
  const coords = renderer._midScreenCoords;
  const before = ctx.calls.filter(c => c[0] === 'image');
  const paintCounts = canvases.map(c => c.getContext().calls.length);
  ctx.calls.length = 0;
  renderer.spaceTime = 2; renderer.parallaxDriftX = 16; renderer.parallaxDriftY = 8;
  draw();
  assert.equal(renderer._midScreenCoords, coords);
  assert.deepEqual(canvases.map(c => c.getContext().calls.length), paintCounts);
  assert.equal(ctx.calls.filter(c => c[0] === 'gradient').length, 0);
  assert.equal(ctx.calls.filter(c => c[0] === 'arc').length, 0);
  assert.equal(ctx.calls.some(c => c[0] === 'blur' && c[1] > 0), false);
  const after = ctx.calls.filter(c => c[0] === 'image');
  assert.equal(after.length, 65);
  assert.notDeepEqual(before.map(c => [c[1], c[3], c[4]]), after.map(c => [c[1], c[3], c[4]]));
  assert.equal(ctx.globalAlpha, 1);
});

test('nebula textures retain colors and breathing, reuse all three buffers across time/resize, and bound memory', () => {
  const { renderer, ctx, draw } = setup();
  const before = JSON.stringify(renderer.nebulae);
  draw();
  const textures = [...renderer.spaceVisualCache.nebulaSprites.entries.values()].map(s => s.canvas);
  assert.equal(textures.length, 3);
  const paintCounts = textures.map(c => c.getContext().calls.length);
  const stops = textures[0].getContext().calls.filter(c => c[0] === 'stop');
  assert.deepEqual(stops, [['stop', 0, 'rgba(0, 180, 216, 1)'],
    ['stop', .65, `rgba(0, 243, 255, ${.015 / .055})`], ['stop', 1, 'rgba(5, 7, 17, 0)']]);
  for (let frame = 0; frame < 100; frame++) {
    renderer.spaceTime = frame * .5;
    renderer.parallaxDriftX = frame * 4; renderer.parallaxDriftY = frame * 2;
    renderer.canvas.pixelRatio = frame % 2 ? 1 : 3;
    const scale = frame % 2 ? .5 : 1;
    ctx.calls.length = 0; draw(390, 844, scale);
    const images = ctx.calls.filter(c => c[0] === 'image').slice(0, 3);
    for (let i = 0; i < images.length; i++) {
      const neb = renderer.nebulae[i], radius = (neb.radius + Math.sin(renderer.spaceTime * .35 + neb.phase) * 35) * scale;
      const x = ((neb.baseX * 390 + Math.sin(renderer.spaceTime * .2 + neb.phase) * 60 * scale - renderer.parallaxDriftX * .15 * scale) % 390 + 390) % 390;
      const y = ((neb.baseY * 844 + Math.cos(renderer.spaceTime * .18 + neb.phase) * 45 * scale - renderer.parallaxDriftY * .15 * scale) % 844 + 844) % 844;
      assert.equal(images[i][2], textures[i]);
      assert.deepEqual(images[i].slice(3), [x - radius, y - radius, radius * 2, radius * 2]);
    }
  }
  assert.deepEqual(textures.map(c => c.getContext().calls.length), paintCounts);
  assert.equal(textures.reduce((sum, c) => sum + c.width * c.height * 4, 0), 3 * 1024 * 1024);
  assert.equal(JSON.stringify(renderer.nebulae), before);
});

test('space sprites rebuild for mobile size/DPR, preserve proportional size and keep cache memory bounded', () => {
  const { renderer, ctx, draw } = setup();
  draw();
  const desktop = ctx.calls.filter(c => c[0] === 'image');
  renderer.canvas.pixelRatio = 2;
  ctx.calls.length = 0; draw(390, 520, .5);
  const mobile = ctx.calls.filter(c => c[0] === 'image');
  for (let i = 0; i < desktop.length; i++) {
    assert.equal(mobile[i][5], desktop[i][5] * .5);
    assert.equal(mobile[i][6], desktop[i][6] * .5);
  }
  for (let i = 0; i < 20; i++) {
    renderer.canvas.pixelRatio = i % 2 ? 1 : 3;
    draw(390 + i, 520, i % 2 ? .6 : 1);
    const cache = renderer.spaceVisualCache.sprites.entries;
    assert.equal(cache.size, 62);
    assert.ok([...cache.values()].every(s => s.canvas.width <= 128 && s.canvas.height <= 128));
    assert.ok([...cache.values()].reduce((sum, s) => sum + s.canvas.width * s.canvas.height * 4, 0) < 2 * 1024 * 1024);
  }
});

test('constellation paths persist during drift, skip wrap gaps and rebuild geometry only on resize', () => {
  const { renderer, ctx, paths, draw } = setup();
  renderer.midStars = [
    { type: 'dot', x: 100, y: 800, size: 3, alpha: .8, twinkleSpeed: 1, twinklePhase: 0, color: '#0ff' },
    { type: 'dot', x: 200, y: 900, size: 3, alpha: .8, twinkleSpeed: 1, twinklePhase: 0, color: '#0ff' }
  ];
  renderer.constellations = [[0, 1]];
  draw(); assert.equal(paths.length, 1);
  assert.deepEqual(paths[0].points, [[0, 0], [50, 50]]);
  renderer.parallaxDriftX = 50; draw(); assert.equal(paths.length, 1);
  ctx.calls.length = 0;
  renderer.parallaxDriftX = 150 / .7; draw();
  assert.equal(ctx.calls.some(c => c[0] === 'stroke'), false, 'opposite edges must not be linked');
  renderer.parallaxDriftX = 0; draw(600, 400);
  assert.equal(paths.length, 2);
  assert.deepEqual(paths[1].points, [[0, 0], [25, 25]]);
});
