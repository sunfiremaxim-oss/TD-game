import test from 'node:test';
import assert from 'node:assert/strict';
import { AegisShieldVisual, AEGIS_SHIMMER, getAegisCoverStrength } from '../src/visuals/AegisShieldVisual.js';
import { RenderSystem } from '../src/systems/RenderSystem.js';
import { World } from '../src/core/World.js';
import { EnemyComponent } from '../src/components/EnemyComponent.js';
import { HealthComponent } from '../src/components/HealthComponent.js';
import { TransformComponent } from '../src/components/TransformComponent.js';
import { RenderComponent } from '../src/components/RenderComponent.js';
import { EnemyIntelRenderer } from '../src/ui/UIManager.js';

function context() {
  const calls = [];
  const states = [];
  return {
    calls, globalAlpha: 1, shadowBlur: 0, lineWidth: 1, lineCap: 'butt', strokeStyle: '#000',
    save() { states.push({ globalAlpha: this.globalAlpha, shadowBlur: this.shadowBlur,
      lineWidth: this.lineWidth, lineCap: this.lineCap, strokeStyle: this.strokeStyle }); },
    restore() { Object.assign(this, states.pop()); },
    createRadialGradient() {
      const stops = [];
      calls.push(['gradient', stops, this.globalCompositeOperation]);
      return { addColorStop(...args) { stops.push(args); } };
    },
    setTransform(...args) { calls.push(['transform', ...args]); },
    translate(...args) { calls.push(['translate', ...args]); },
    rotate(angle) { calls.push(['rotate', angle]); },
    scale(...args) { calls.push(['scale', ...args]); },
    fillRect(...args) { calls.push(['fillRect', ...args]); },
    beginPath() {}, closePath() { calls.push(['closePath']); },
    rect() {}, clip() {},
    fill() { calls.push(['fill']); },
    moveTo(...args) { calls.push(['moveTo', ...args]); },
    lineTo(...args) { calls.push(['lineTo', ...args]); },
    arc(...args) { calls.push(['arc', ...args]); },
    stroke() { calls.push(['stroke', this.shadowBlur, this.globalAlpha]); },
    drawImage(...args) { calls.push(['image', ...args, this.globalAlpha, this.shadowBlur]); }
  };
}

function setupVisual() {
  const builds = [];
  const visual = new AegisShieldVisual(() => {
    const cacheContext = context();
    builds.push(cacheContext);
    return { width: 0, height: 0, getContext: () => cacheContext };
  });
  return { visual, builds };
}

test('steady shield frames share one atlas with at most two blits and no live gradients or blur', () => {
  const { visual, builds } = setupVisual();
  const ctx = context();
  for (let frame = 0; frame < 240; frame++) visual.draw(ctx, 300, 200, 115, frame / 120, 1.2);
  assert.equal(builds.length, 2);
  assert.equal(builds[0].calls.filter(call => call[0] === 'gradient').length, 2);
  const imageCount = ctx.calls.filter(call => call[0] === 'image').length;
  assert.ok(imageCount >= 240 && imageCount <= 480);
  assert.equal(builds[1].calls.filter(call => call[0] === 'gradient').length, AEGIS_SHIMMER.frames);
  assert.equal(ctx.calls.filter(call => call[0] === 'stroke').length, 0);
  assert.equal(ctx.calls.filter(call => call[0] === 'arc').length, 0);
  assert.ok(!ctx.calls.some(call => call[0] === 'gradient'));
  assert.ok(ctx.calls.filter(call => call[0] === 'stroke').every(call => call[1] === 0));
  assert.ok(ctx.calls.filter(call => call[0] === 'image').every(call => call.at(-1) === 0));
});

test('resize reuses the bounded atlas and base canvases, rebuilding only when resolution changes', () => {
  const { visual, builds } = setupVisual();
  const ctx = context();
  visual.draw(ctx, 0, 0, 115, 0, 0.5);
  const initialTexture = visual.texture;
  const initialSize = initialTexture.width;
  visual.draw(ctx, 0, 0, 115, 1, 0.501);
  assert.equal(builds[0].calls.filter(call => call[0] === 'gradient').length, 2);
  visual.draw(ctx, 0, 0, 115, 2, 2);
  assert.equal(visual.texture, initialTexture);
  assert.ok(visual.texture.width > initialSize);
  assert.equal(builds[0].calls.filter(call => call[0] === 'gradient').length, 4);
  visual.draw(ctx, 0, 0, 115, 3, 4);
  assert.equal(builds[0].calls.filter(call => call[0] === 'gradient').length, 4);
  visual.draw(ctx, 0, 0, 1000, 4, 4);
  assert.ok(visual.texture.width <= 1024 && visual.texture.height <= 1024);
  assert.ok(visual.baseTexture.width <= 256);
  const cacheBytes = 4 * (visual.texture.width * visual.texture.height + visual.baseTexture.width * visual.baseTexture.height);
  assert.ok(cacheBytes <= 4.25 * 1024 * 1024);
  assert.equal(builds.length, 2);
});

test('pulse changes opacity without changing shield position or radius, and restores canvas state', () => {
  const { visual } = setupVisual();
  const ctx = context();
  ctx.globalAlpha = 0.5;
  ctx.shadowBlur = 17;
  const totals = [];
  for (const time of [0, Math.PI / 3.6, Math.PI / 1.8, Math.PI * 3 / 3.6]) {
    const previousCount = ctx.calls.length;
    visual.draw(ctx, 250, 150, 115, time);
    totals.push(ctx.calls.slice(previousCount).filter(call => call[0] === 'image').reduce((sum, call) => sum + call.at(-2), 0));
    assert.equal(ctx.globalAlpha, 0.5);
    assert.equal(ctx.shadowBlur, 17);
    assert.equal(ctx.lineCap, 'butt');
  }
  const images = ctx.calls.filter(call => call[0] === 'image');
  assert.ok(new Set(images.map(call => call.at(-2))).size > 1);
  assert.ok(totals.every(alpha => alpha >= 0.339 && alpha <= 0.461));
  for (const image of images) {
    const expected = [-124.2, -124.2, 248.4, 248.4];
    image.slice(6, 10).forEach((value, index) => assert.ok(Math.abs(value - expected[index]) < 1e-9));
  }
  assert.equal(ctx.calls.filter(call => call[0] === 'arc').length, 0);
  assert.ok(ctx.calls.filter(call => call[0] === 'translate').every(call => call[1] === 250 && call[2] === 150));
});

test('cached shields counter-rotate at 0.70 / 1.7 of emitter speed without angle-wrap jumps', () => {
  const { visual, builds } = setupVisual();
  for (const speed of [-0.5, 0.5]) {
    for (const initial of [-Math.PI * 2 - 0.01, Math.PI * 2 - 0.01, 100]) {
      const ctx = context();
      for (const time of [0, 0.1, 1, 5]) visual.draw(ctx, 30, 50, 115, time, 1, 0, initial + speed * time);
      const angles = ctx.calls.filter(call => call[0] === 'rotate').map(call => call[1]);
      assert.ok(Math.abs((angles[3] - angles[0]) / 5 + speed * (0.70 / 1.7)) < 1e-12);
      assert.ok(Math.abs(angles[1] - angles[0]) < 0.04, 'no jump at a full revolution');
      visual.draw(ctx, 30, 50, 115, 6, 1, 0, initial + speed * 5);
      assert.equal(ctx.calls.filter(call => call[0] === 'rotate').at(-1)[1], angles[3], 'frozen emitter freezes rotation');
    }
  }
  assert.equal(builds.length, 2, 'rotation must not generate new textures');
  assert.equal(builds[0].calls.filter(call => call[0] === 'gradient').length, 2);
});

test('shimmer interpolates adjacent atlas frames and loops smoothly with independent emitter phases', () => {
  const { visual } = setupVisual();
  const framesAt = (time, phase = 0) => {
    const ctx = context();
    visual.draw(ctx, 0, 0, 115, time, 1, phase);
    return ctx.calls.filter(call => call[0] === 'image').map(call => ({
      index: call[3] / visual.frameSize * AEGIS_SHIMMER.columns + call[2] / visual.frameSize,
      alpha: call.at(-2)
    }));
  };
  assert.deepEqual(framesAt(0).map(frame => frame.index), [0]);
  const halfway = AEGIS_SHIMMER.period / AEGIS_SHIMMER.frames / 2;
  const blended = framesAt(halfway);
  assert.deepEqual(blended.map(frame => frame.index), [0, 1]);
  assert.ok(Math.abs(blended[0].alpha - blended[1].alpha) < 1e-9);
  const beforeLoop = framesAt(AEGIS_SHIMMER.period - 0.001);
  const afterLoop = framesAt(AEGIS_SHIMMER.period + 0.001);
  assert.deepEqual(beforeLoop.map(frame => frame.index), [15, 0]);
  assert.deepEqual(afterLoop.map(frame => frame.index), [0, 1]);
  assert.ok(beforeLoop[1].alpha > beforeLoop[0].alpha * 100);
  assert.ok(afterLoop[0].alpha > afterLoop[1].alpha * 100);
  assert.notDeepEqual(framesAt(1).map(frame => frame.index), framesAt(1, 2).map(frame => frame.index));
  assert.deepEqual(framesAt(1), framesAt(1), 'repeated rendering cannot advance animation state');
});

test('atlas frames light different cell groups rather than only pulsing the entire shield', () => {
  const { visual, builds } = setupVisual();
  visual.draw(context(), 0, 0, 115, 0);
  const patterns = [];
  for (const call of builds[1].calls) {
    if (call[0] === 'image') patterns.push([]);
    if (call[0] === 'moveTo') patterns.at(-1).push(call.slice(1));
  }
  assert.equal(patterns.length, AEGIS_SHIMMER.frames);
  assert.ok(patterns.every(pattern => pattern.length > 0));
  assert.ok(new Set(patterns.map(pattern => JSON.stringify(pattern))).size > 8);
});

test('honeycomb and feathered edge are baked once without a hard circular outline', () => {
  const { visual, builds } = setupVisual();
  visual.draw(context(), 0, 0, 115, 0);
  const calls = builds[0].calls;
  const cells = calls.filter(call => call[0] === 'closePath').length;
  assert.ok(cells > 50, 'the texture must contain the energy cells');
  assert.equal(calls.filter(call => call[0] === 'lineTo').length, cells * 5);
  assert.equal(calls.filter(call => call[0] === 'stroke').length, 1, 'one batched mesh stroke at build time');
  assert.equal(calls.filter(call => call[0] === 'arc').length, 0, 'no perimeter stroke');
  const gradients = calls.filter(call => call[0] === 'gradient');
  assert.equal(gradients[0][2], 'destination-in', 'soft mask applies to the mesh');
  assert.ok(gradients[0][1].some(([offset]) => offset > 0.8 && offset < 1));
  assert.deepEqual(gradients[0][1].at(-1), [1, 'rgba(255, 255, 255, 0)']);
  assert.deepEqual(gradients[1][1].at(-1), [1, 'rgba(68, 174, 255, 0)']);
});

function addEnemy(world, x, y, type = 'aegis', hp = 100) {
  const id = world.createEntity();
  for (const component of [new EnemyComponent(type), new TransformComponent(x, y), new HealthComponent(hp, 100)]) {
    world.addComponent(id, component);
  }
  return id;
}

test('offscreen and destroyed shields are skipped while partially visible domes remain', () => {
  const world = new World();
  world.width = 640; world.height = 800; world.renderScale = 0.6;
  const firstAegis = addEnemy(world, 200, 200);
  world.getComponent(firstAegis, TransformComponent).rotation = 2;
  addEnemy(world, -120, 300); // Center outside, but part of the dome is visible.
  addEnemy(world, -130, 300);
  addEnemy(world, 770, 300);
  addEnemy(world, 200, -130);
  addEnemy(world, 200, 930);
  addEnemy(world, 200, 200, 'scout');
  addEnemy(world, 200, 200, 'aegis', 0);
  const removed = addEnemy(world, 200, 200);
  world.destroyEntity(removed);
  const render = Object.create(RenderSystem.prototype);
  const draws = [];
  Object.assign(render, { canvas: { pixelRatio: 2 }, spaceTime: 3,
    aegisShieldVisual: { draw: (...args) => draws.push(args) } });
  render._drawAegisDomes({}, world);
  assert.equal(draws.length, 2);
  assert.equal(draws[0][3], 115);
  assert.equal(draws[0][5], 1.2);
  assert.equal(draws[0][7], 2, 'the shield receives the actual emitter angle');
  assert.equal(draws[1][1], -120);
  assert.notEqual(draws[0][6], draws[1][6], 'multiple shields have independent pulse phases');
});

test('four overlapping Aegises reuse the texture and preserve gameplay components', () => {
  const world = new World();
  for (let i = 0; i < 4; i++) addEnemy(world, 300 + i * 15, 300);
  const { visual, builds } = setupVisual();
  const render = Object.create(RenderSystem.prototype);
  Object.assign(render, { canvas: { pixelRatio: 2 }, spaceTime: 1, aegisShieldVisual: visual });
  const snapshot = () => [...world.componentStores].map(([type, store]) => [type.name, [...store]]);
  const before = JSON.stringify(snapshot());
  const ctx = context();
  render._drawAegisDomes(ctx, world);
  assert.equal(builds.length, 2);
  assert.equal(builds[0].calls.filter(call => call[0] === 'gradient').length, 2);
  const imageCount = ctx.calls.filter(call => call[0] === 'image').length;
  assert.ok(imageCount >= 4 && imageCount <= 8);
  assert.equal(ctx.calls.filter(call => call[0] === 'stroke').length, 0);
  assert.equal(JSON.stringify(snapshot()), before);
});

test('the shell covers enemy bodies while projectiles remain above the field', () => {
  const ctx = { setTransform() {}, save() {}, restore() {} };
  const render = new RenderSystem({ width: 640, height: 800, getContext: () => ctx }, null);
  const order = [];
  for (const method of ['_drawSpaceBackground', '_drawTacticalGrids', '_drawTowerAndRange',
    '_drawEnemies', '_drawAegisDomes', '_drawProjectiles']) {
    render[method] = () => order.push(method);
  }
  render.update(new World(), 0);
  assert.ok(order.indexOf('_drawEnemies') < order.indexOf('_drawAegisDomes'));
  assert.ok(order.indexOf('_drawAegisDomes') < order.indexOf('_drawProjectiles'));
  assert.equal(order.filter(method => method === '_drawAegisDomes').length, 1);
});

test('the enemy database also encloses its Aegis emitter in the centered shell', () => {
  const renderer = Object.create(EnemyIntelRenderer.prototype);
  const order = [];
  const ctx = context();
  ctx.translate = (...args) => order.push(['core-center', ...args]);
  renderer._drawPolygonPath = () => order.push(['core']);
  renderer.aegisShieldVisual = { draw: (...args) => {
    order.push(['shell', ...args.slice(1, 4)]);
    assert.equal(args[7], 0.5, 'preview shell follows the visible emitter angle');
  } };
  renderer._drawAegis(ctx, 1);
  assert.deepEqual(order[0], ['core-center', 60, 60]);
  assert.deepEqual(order.at(-1), ['shell', 60, 60, 44]);
  assert.ok(ctx.calls.filter(call => call[0] === 'stroke').every(call => call[2] === 0.75));
  assert.equal(ctx.globalAlpha, 1);
  assert.ok(Math.abs(ctx.calls.find(call => call[0] === 'rotate')[1] - 0.5) < 1e-9);
});

test('visual cover blends at the edge and overlapping domes do not stack attenuation', () => {
  const field = { x: 200, y: 300, radius: 115 };
  assert.equal(getAegisCoverStrength(200, 300, []), 0);
  assert.equal(getAegisCoverStrength(200, 300, [field]), 1);
  assert.equal(getAegisCoverStrength(297, 300, [field]), 1);
  assert.equal(getAegisCoverStrength(306, 300, [field]), 0.5);
  assert.equal(getAegisCoverStrength(315, 300, [field]), 0);
  assert.equal(getAegisCoverStrength(316, 300, [field]), 0);
  assert.equal(getAegisCoverStrength(306, 300, [field, field]), 0.5);
  assert.equal(getAegisCoverStrength(306, 300, [field, { x: 306, y: 300, radius: 40 }]), 1);
  assert.equal(getAegisCoverStrength(220, 300, [{ ...field, radius: 10 }]), 0);
});

function recordEnemyBodies(world) {
  const ctx = context();
  let position;
  const bodies = [], bars = [];
  ctx.translate = (x, y) => { position = [x, y]; };
  ctx.stroke = ctx.fill = () => bodies.push({ position, alpha: ctx.globalAlpha, blur: ctx.shadowBlur });
  const render = Object.create(RenderSystem.prototype);
  render.corePulseAngle = 0;
  render._drawHealthBar = () => bars.push(ctx.globalAlpha);
  render._drawBossHullHealth = () => bars.push(ctx.globalAlpha);
  render._drawEnemies(ctx, world);
  return { bodies, bars, ctx };
}

test('covered emitters and allies dim while outside enemies and HP bars retain brightness', () => {
  const world = new World();
  const ids = [addEnemy(world, 200, 200), addEnemy(world, 220, 200, 'scout', 50),
    addEnemy(world, 306, 200, 'scout'), addEnemy(world, 340, 200, 'scout'),
    addEnemy(world, 200, 220, 'boss_architect', 50)];
  for (const id of ids) world.addComponent(id, new RenderComponent('polygon', 3, 19, '#fff', '#fff', 14));
  const before = JSON.stringify([...world.componentStores].map(([type, store]) => [type.name, [...store]]));
  let queries = 0;
  const originalQuery = world.getEntitiesWith.bind(world);
  world.getEntitiesWith = (...types) => { queries++; return originalQuery(...types); };
  const { bodies, bars, ctx } = recordEnemyBodies(world);
  const maximumBlur = new Map();
  for (const body of bodies) {
    const x = body.position[0];
    assert.equal(body.alpha, x === 340 ? 1 : x === 306 ? 0.875 : 0.75);
    assert.ok(body.blur <= (x === 340 ? 14 : x === 306 ? 10.5 : 7));
    maximumBlur.set(x, Math.max(maximumBlur.get(x) || 0, body.blur));
  }
  for (const [x, blur] of maximumBlur) assert.equal(blur, x === 340 ? 14 : x === 306 ? 10.5 : 7);
  assert.ok(bodies.some(body => body.position[0] === 200 && body.position[1] === 220));
  assert.ok(bars.length > 0 && bars.every(alpha => alpha === 1));
  assert.equal(ctx.globalAlpha, 1);
  assert.equal(queries, 2, 'the emitter list is built once, not queried for every enemy');
  assert.equal(JSON.stringify([...world.componentStores].map(([type, store]) => [type.name, [...store]])), before);
});

test('moving outside or losing the emitter restores brightness without stale cached coverage', () => {
  const world = new World();
  const aegis = addEnemy(world, 200, 200);
  const ally = addEnemy(world, 220, 200, 'scout');
  world.addComponent(ally, new RenderComponent('polygon', 3, 12, '#ff0', '#ff0', 10));
  const alpha = () => recordEnemyBodies(world).bodies[0].alpha;
  assert.equal(alpha(), 0.75);
  world.getComponent(ally, TransformComponent).x = 350;
  assert.equal(alpha(), 1);
  world.getComponent(ally, TransformComponent).x = 220;
  assert.equal(alpha(), 0.75);
  world.getComponent(aegis, HealthComponent).current = 0;
  assert.equal(alpha(), 1);
  world.getComponent(aegis, HealthComponent).current = 100;
  world.destroyEntity(aegis);
  assert.equal(alpha(), 1);
});
