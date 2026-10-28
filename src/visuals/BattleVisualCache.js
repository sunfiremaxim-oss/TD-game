import { drawArchitectChassis, drawArchitectPlate } from './ArchitectVisual.js';

// Small bounded sprite caches. Keys describe artwork, never entity IDs or time.
export class SpriteCache {
  constructor(limit = 64, maxSide = 256, createCanvas = () => document.createElement('canvas')) {
    this.limit = limit; this.maxSide = maxSide; this.createCanvas = createCanvas;
    this.entries = new Map();
  }
  get(key, extent, pixelScale, paint) {
    const density = Math.min(2, Math.max(0.5, Math.ceil(pixelScale * 4) / 4), this.maxSide / (extent * 2));
    const fullKey = `${key}|${density}`;
    let sprite = this.entries.get(fullKey);
    if (sprite) { this.entries.delete(fullKey); this.entries.set(fullKey, sprite); return sprite; }
    const canvas = this.createCanvas(), size = Math.min(this.maxSide, Math.ceil(extent * 2 * density));
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(density, 0, 0, density, size / 2, size / 2);
    paint(ctx);
    sprite = { canvas, extent };
    this.entries.set(fullKey, sprite);
    while (this.entries.size > this.limit) this.entries.delete(this.entries.keys().next().value);
    return sprite;
  }
}
function blit(ctx, sprite, angle = 0, alpha = 1, scale = 1) {
  ctx.save(); ctx.shadowBlur = 0;
  if (angle) ctx.rotate(angle);
  ctx.globalAlpha *= alpha;
  const extent = sprite.extent * scale;
  ctx.drawImage(sprite.canvas, -extent, -extent, extent * 2, extent * 2);
  ctx.restore();
}
const styleKey = render => JSON.stringify([render.radius, render.sides, render.color, render.glowColor, render.glowBlur]);

export class RangeFieldVisual {
  constructor(createCanvas = () => document.createElement('canvas')) {
    this.createCanvas = createCanvas; this.layers = new Map(); this.key = null;
  }
  draw(ctx, renderer, x, y, range, pixelScale) {
    const extent = Math.ceil(range + 30);
    const density = Math.min(2, Math.max(.5, Math.ceil(pixelScale * 4) / 4), 768 / (extent * 2));
    const key = `${range}|${density}`;
    if (key !== this.key) {
      for (const name of ['field', 'perimeter', 'accent', 'ticks']) {
        const sprite = this.layers.get(name) || { canvas: this.createCanvas() };
        sprite.extent = extent;
        const size = Math.min(768, Math.ceil(extent * 2 * density));
        sprite.canvas.width = sprite.canvas.height = size;
        const cache = sprite.canvas.getContext('2d');
        cache.setTransform(density, 0, 0, density, size / 2, size / 2);
        if (name === 'field') { renderer._drawTowerGrid(cache, 0, 0, range); renderer._drawRangeBase(cache, 0, 0, range); }
        else if (name === 'perimeter') renderer._drawRangePerimeter(cache, 0, 0, range, 0);
        else if (name === 'accent') renderer._drawRangeAccent(cache, 0, 0, range, 0);
        else renderer._drawRangeTicks(cache, 0, 0, range, 0);
        this.layers.set(name, sprite);
      }
      this.key = key;
    }
    ctx.save(); ctx.translate(x, y);
    blit(ctx, this.layers.get('field'));
    blit(ctx, this.layers.get('perimeter'), renderer.radarRotation * 40 / range);
    blit(ctx, this.layers.get('accent'), -renderer.radarRotation * 25 / (range - 5));
    blit(ctx, this.layers.get('ticks'), renderer.radarRotation * .25);
    ctx.restore();
  }
}

export class TowerVisual {
  constructor(createCanvas) { this.cache = new SpriteCache(5, 256, createCanvas); }
  draw(ctx, renderer, render, health, x, y, rotation, density) {
    const key = styleKey(render), extent = render.radius + 42;
    const sprite = (part, paint) => this.cache.get(`${part}|${key}`, extent, density, paint);
    ctx.save(); ctx.translate(x, y);
    blit(ctx, sprite('chassis', c => renderer._drawTowerChassis(c, render, null)));
    if (health) {
      if (health.current >= health.max) blit(ctx, sprite('health-full', c => renderer._drawTowerHealthRing(c, render.radius, health)));
      else renderer._drawTowerHealthRing(ctx, render.radius, health, false);
    }
    blit(ctx, sprite('reactor', c => renderer._drawReactorCore(c, render.radius, 1)), 0, .9 + Math.sin(renderer.corePulseAngle) * .1);
    blit(ctx, sprite('barrel', c => renderer._drawTowerBarrel(c, render, 0)), rotation);
    ctx.restore();
  }
}

export class EnemyVisualCache {
  constructor(createCanvas) {
    this.cache = new SpriteCache(64, 256, createCanvas);
    this.architectLayer = null;
  }
  draw(ctx, renderer, type, render, glowScale, density, variant = '', armorOpen = variant === 'overheated' ? 1 : 0) {
    const key = `${type}|${styleKey(render)}|${variant}`;
    const extent = render.radius * 1.5 + render.glowBlur * 3 + 4;
    const weight = Math.max(0, Math.min(1, (glowScale - .5) * 2));
    // Source-over needs a compensated first weight, otherwise opaque bodies
    // become accidentally translucent halfway through a dome's edge fade.
    const lowOpacity = weight >= 1 ? 0 : (1 - weight) / (1 - ctx.globalAlpha * weight);
    const variants = [[.5, lowOpacity], [1, weight]];
    if (type === 'boss_architect' && variant) {
      this._drawArchitectArmor(ctx, renderer, render, key, density, variant, armorOpen, variants);
      return;
    }
    for (const [glow, opacity] of variants) {
      if (opacity <= 0) continue;
      const sprite = this.cache.get(`${key}|${glow}`, extent, density,
        c => renderer._drawEnemyBody(c, type, render, glow, false, variant));
      blit(ctx, sprite, 0, opacity);
    }
    if (type === 'boss_architect') {
      const scale = .94 + Math.sin(renderer.corePulseAngle * 1.2) * .06;
      const coreRadius = render.radius * 9 / 44;
      for (const [glow, opacity] of variants) {
        if (opacity <= 0) continue;
        const sprite = this.cache.get(`boss-core|${key}|${glow}`, coreRadius + 32, density, c => renderer._drawBossCore(c, coreRadius, glow, variant));
        blit(ctx, sprite, 0, opacity, scale);
      }
    }
  }

  _drawArchitectArmor(ctx, renderer, render, key, density, phase, armorOpen, variants) {
    if (ctx.globalAlpha < 1) {
      // Apply Aegis attenuation to the assembled hull once. Otherwise the
      // overlapping chassis and plates would accumulate opacity under a dome.
      if (!this.architectLayer) {
        const canvas = this.cache.createCanvas();
        this.architectLayer = { canvas, ctx: canvas.getContext('2d'), extent: 0 };
      }
      const layer = this.architectLayer;
      layer.extent = render.radius * 1.5 + render.glowBlur * 3 + 4;
      const scale = Math.min(2, Math.max(.5, density), 384 / (layer.extent * 2));
      const size = Math.ceil(layer.extent * 2 * scale);
      if (layer.canvas.width !== size || layer.canvas.height !== size) layer.canvas.width = layer.canvas.height = size;
      layer.ctx.setTransform(scale, 0, 0, scale, size / 2, size / 2);
      layer.ctx.clearRect(-layer.extent, -layer.extent, layer.extent * 2, layer.extent * 2);
      layer.ctx.globalAlpha = 1; layer.ctx.globalCompositeOperation = 'source-over'; layer.ctx.shadowBlur = 0;
      const weight = variants[1][1];
      this._drawArchitectArmor(layer.ctx, renderer, render, key, density, phase, armorOpen, [[.5, weight >= 1 ? 0 : 1], [1, weight]]);
      blit(ctx, layer);
      return;
    }
    // Continuous translation uses three fixed sprites per lighting level. No
    // animation frame, entity ID or opening amount is part of a cache key.
    for (const [glow, opacity] of variants) {
      if (opacity <= 0) continue;
      const chassis = this.cache.get(`arch-chassis|${key}|${glow}`, render.radius * .8 + render.glowBlur * 2 + 4, density,
        c => drawArchitectChassis(c, render, glow, phase));
      blit(ctx, chassis, 0, opacity);
    }
    for (const [glow, opacity] of variants) {
      if (opacity <= 0) continue;
      const plate = this.cache.get(`arch-plate|${key}|${glow}`, render.radius + render.glowBlur * 2 + 4, density,
        c => drawArchitectPlate(c, render, glow, phase));
      for (let side = 0; side < 4; side++) {
        ctx.save(); ctx.rotate(side * Math.PI / 2);
        ctx.translate(0, -render.radius * .32 * Math.max(0, Math.min(1, armorOpen)));
        blit(ctx, plate, 0, opacity); ctx.restore();
      }
    }
    const coreRadius = render.radius * 9 / 44;
    const pulse = .94 + Math.sin(renderer.corePulseAngle * 1.2) * .06;
    for (const [glow, opacity] of variants) {
      if (opacity <= 0) continue;
      const core = this.cache.get(`arch-core|${key}|${glow}`, coreRadius + 32, density,
        c => renderer._drawBossCore(c, coreRadius, glow, phase));
      blit(ctx, core, 0, opacity, pulse);
    }
  }
}

export class ProjectileVisualCache {
  constructor(createCanvas) { this.cache = new SpriteCache(16, 128, createCanvas); }
  draw(ctx, render, projectile, density) {
    const extent = Math.max(render.radius, projectile.isCrit ? 8 : 6) + render.glowBlur * 3 + 4;
    const key = `${projectile.isEnemy}|${projectile.isCrit}|${!!projectile.isHeavyPlasma}|${styleKey(render)}`;
    const sprite = this.cache.get(key, extent, density, c => {
      c.shadowColor = render.glowColor; c.shadowBlur = render.glowBlur; c.fillStyle = render.color;
      if (projectile.isHeavyPlasma) {
        // A compact cached wake, bright envelope and hot core distinguish heavy plasma.
        c.fillStyle='#5b95ff50';c.beginPath();c.moveTo(-render.radius*2.8,0);
        c.lineTo(0,-render.radius*.75);c.lineTo(0,render.radius*.75);c.closePath();c.fill();
        c.fillStyle='#69bfff';c.beginPath();c.arc(0,0,render.radius,0,Math.PI*2);c.fill();
        c.shadowBlur=0;c.fillStyle='#e4fcff';c.beginPath();c.arc(1,0,render.radius*.48,0,Math.PI*2);c.fill();
        c.strokeStyle='#b7ecff';c.lineWidth=1;c.beginPath();c.arc(0,0,render.radius*1.22,-1.2,1.2);c.stroke();
      }
      else if (projectile.isEnemy) { c.beginPath(); c.arc(0, 0, render.radius, 0, Math.PI * 2); c.fill(); }
      else { const length = projectile.isCrit ? 16 : 12, width = projectile.isCrit ? 5 : 3.5; c.fillRect(-length / 2, -width / 2, length, width); }
    });
    blit(ctx, sprite);
  }
}
