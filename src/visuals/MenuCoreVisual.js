import { GameConfig } from '../config/GameConfig.js';

// Expensive paths, gradients and bloom are baked once. The live frame only
// composites seven bounded images; chassis, radar and gun move independently.
export class MenuCoreVisual {
  constructor(createCanvas = () => document.createElement('canvas')) {
    this.createCanvas = createCanvas;
    this.layers = new Map();
    this.cacheKey = null;
  }

  _prepare(renderer, render, health, pixelScale) {
    const density = Math.max(0.5, Math.min(2, Math.ceil(pixelScale * 4) / 4));
    const key = JSON.stringify([density, render.radius, render.color, render.glowColor,
      render.glowBlur, health.current, health.max]);
    if (key === this.cacheKey) return;

    const definitions = [
      ['field', 140, ctx => {
        renderer._drawTowerGrid(ctx, 0, 0, 130);
        renderer._drawRangeBase(ctx, 0, 0, 130);
      }],
      ['perimeter', 160, ctx => renderer._drawRangePerimeter(ctx, 0, 0, 130, 0)],
      ['accent', 145, ctx => renderer._drawRangeAccent(ctx, 0, 0, 130, 0)],
      ['ticks', 160, ctx => renderer._drawRangeTicks(ctx, 0, 0, 130, 0)],
      ['chassis', render.radius * 2.5 + 24, ctx => {
        ctx.scale(2.5, 2.5);
        renderer._drawTowerChassis(ctx, render, health);
      }],
      ['reactor', render.radius * 0.48 * 2.5 + 14, ctx => {
        ctx.scale(2.5, 2.5);
        renderer._drawReactorCore(ctx, render.radius, 1);
      }],
      ['barrel', (render.radius + GameConfig.tower.barrelExtension) * 2.5 + 20, ctx => {
        ctx.scale(2.5, 2.5);
        renderer._drawTowerBarrel(ctx, render, 0);
      }]
    ];
    for (const [name, extent, paint] of definitions) {
      const layer = this.layers.get(name) || { canvas: this.createCanvas() };
      layer.extent = extent;
      const size = Math.ceil(extent * 2 * density);
      layer.canvas.width = size;
      layer.canvas.height = size;
      const ctx = layer.canvas.getContext('2d');
      ctx.setTransform(density, 0, 0, density, size / 2, size / 2);
      paint(ctx);
      this.layers.set(name, layer);
    }
    this.cacheKey = key;
  }

  _drawLayer(ctx, name, rotation = 0, opacity = 1) {
    const { canvas, extent } = this.layers.get(name);
    ctx.save();
    if (rotation) ctx.rotate(rotation);
    ctx.globalAlpha *= opacity;
    ctx.drawImage(canvas, -extent, -extent, extent * 2, extent * 2);
    ctx.restore();
  }

  draw(ctx, renderer, render, health, width, height, pixelRatio) {
    const scale = Math.min(width, height) / 340;
    this._prepare(renderer, render, health, scale * pixelRatio);
    ctx.save();
    ctx.shadowBlur = 0;
    ctx.translate(width / 2, height / 2);
    ctx.scale(scale, scale);
    this._drawLayer(ctx, 'field');
    // A dash offset is a distance along the circle; rotation = distance / radius.
    this._drawLayer(ctx, 'perimeter', renderer.radarRotation * 40 / 130);
    this._drawLayer(ctx, 'accent', -renderer.radarRotation * 25 / 125);
    this._drawLayer(ctx, 'ticks', renderer.radarRotation * 0.25);
    this._drawLayer(ctx, 'chassis');
    this._drawLayer(ctx, 'reactor', 0, 0.9 + Math.sin(renderer.corePulseAngle) * 0.1);
    this._drawLayer(ctx, 'barrel', -0.5 + Math.sin(renderer.spaceTime * 0.22) * 0.55);
    ctx.restore();
  }
}
