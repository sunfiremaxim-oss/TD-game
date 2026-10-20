import test from 'node:test';
import assert from 'node:assert/strict';
import { RenderSystem } from '../src/systems/RenderSystem.js';

function draw(width, height, scale) {
  const render = Object.create(RenderSystem.prototype);
  Object.assign(render, {
    spaceTime: 0, parallaxDriftX: 0, parallaxDriftY: 0,
    distantStars: [{ x: 1200, y: 800, size: 1.5, alpha: 1, twinkleSpeed: 1, twinklePhase: 0, color: '#fff' }],
    midStars: ['diamond', 'cross', 'dot'].map((type, i) => ({ type, x: 600 + i * 100, y: 800, size: 3, alpha: 1, twinkleSpeed: 1, twinklePhase: 0, color: '#0ff' })),
    constellations: [[0, 1]],
    foregroundMotes: [{ x: 1200, y: 800, size: 4, alpha: 1, pulseSpeed: 1, pulsePhase: 0, color: '#0ff' }],
    nebulae: [{ baseX: 0.5, baseY: 0.5, radius: 480, phase: 0, color: '#000', accent: '#000' }]
  });
  const rects = [], arcs = [], moves = [], lines = [], strokes = [], fills = [];
  const ctx = {
    save() {}, restore() {}, beginPath() {}, closePath() {},
    fillRect(...args) { rects.push(args); },
    arc(...args) { arcs.push({ args, blur: this.shadowBlur || 0 }); },
    moveTo(...args) { moves.push(args); }, lineTo(...args) { lines.push(args); },
    stroke() { strokes.push(this.lineWidth); }, fill() { fills.push(this.globalAlpha); },
    createRadialGradient() { return { addColorStop() {} }; }
  };
  render._drawSpaceBackground(ctx, width, height, { renderScale: scale });
  return { rects, arcs, moves, lines, strokes, fills };
}

test('desktop space details retain their original sizes', () => {
  const scene = draw(1200, 800, 1);
  assert.deepEqual(scene.rects[0], [0, 0, 1200, 800]);
  assert.equal(scene.rects[1][2], 1.5);
  assert.equal(scene.arcs[0].args[2], 480);
  assert.equal(scene.arcs[2].args[2], 4);
  assert.equal(scene.arcs[2].blur, 10);
});

for (const [width, height] of [[360, 640], [360, 400], [740, 285]]) {
  test(`space details maintain their size relative to enemies in a ${width}×${height} viewport`, () => {
    const scale = Math.min(width, height) / 640;
    const scene = draw(width, height, scale);
    assert.deepEqual(scene.rects[0], [0, 0, width, height]);
    assert.equal(scene.rects[1][2], 1.5 * scale);
    assert.equal(scene.arcs[0].args[2], 480 * scale);
    assert.equal(scene.arcs[1].args[2], 3 * 0.6 * scale);
    assert.equal(scene.arcs[2].args[2] / (12 * scale), 4 / 12);
    assert.equal(scene.arcs[2].blur, 10 * scale);
    assert.deepEqual(scene.strokes, [0.8 * scale, scale]);
    const diamondTop = scene.moves[1];
    assert.equal(diamondTop[0], width * 0.25);
    assert.equal(diamondTop[1], height * 0.5 - 3 * scale);
  });
}
