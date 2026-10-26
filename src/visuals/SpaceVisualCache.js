import { SpriteCache } from './BattleVisualCache.js';

// Cache artwork, not frames: drift and twinkle still use the current game time.
export class SpaceVisualCache {
  constructor(createCanvas, createPath = () => new Path2D()) {
    this.sprites = new SpriteCache(96, 128, createCanvas);
    this.nebulaSprites = new SpriteCache(3, 512, createCanvas);
    this.nebulaArtwork = new WeakMap();
    this.nebulaeEnabled = true;
    this.artwork = new WeakMap();
    this.links = new WeakMap();
    this.createPath = createPath;
    this.scaleKey = null;
  }

  drawNebula(ctx, renderer, nebula, x, y, radius) {
    const key = `${nebula.color}|${nebula.accent}`;
    let artwork = this.nebulaArtwork.get(nebula);
    if (!artwork || artwork.key !== key) {
      // Bake at higher opacity so faint clouds do not lose alpha precision in
      // an 8-bit transparent texture. Apply their original opacity at the blit.
      const parse = color => /^rgba\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)$/.exec(color);
      const center = parse(nebula.color), edge = parse(nebula.accent);
      const opacity = center && edge ? Math.max(Number(center[4]), Number(edge[4])) || 1 : 1;
      const normalized = match => `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${Number(match[4]) / opacity})`;
      const colors = center && edge ? { color: normalized(center), accent: normalized(edge) } : nebula;
      const sprite = this.nebulaSprites.get(key, 256, 1, cache => renderer._drawSpaceNebula(cache, colors, 0, 0, 256));
      artwork = { key, sprite, opacity };
      this.nebulaArtwork.set(nebula, artwork);
    }
    ctx.save();
    ctx.globalAlpha *= artwork.opacity;
    ctx.drawImage(artwork.sprite.canvas, x - radius, y - radius, radius * 2, radius * 2);
    ctx.restore();
  }

  prepare(detailScale, pixelRatio) {
    const key = `${detailScale}|${pixelRatio}`;
    if (key === this.scaleKey) return;
    // Old resolutions must not remain pinned by the per-star shortcuts.
    this.sprites.entries.clear();
    this.artwork = new WeakMap();
    this.scaleKey = key;
  }

  draw(ctx, renderer, item, x, y, detailScale, pixelRatio, mote = false) {
    let sprite = this.artwork.get(item);
    if (!sprite) {
      const extent = (mote ? item.size + 32 : item.size * 1.3 + 2) * detailScale;
      const key = `${mote ? 'mote' : item.type}|${item.size}|${item.color}`;
      sprite = this.sprites.get(key, extent, pixelRatio, cache => {
        if (mote) renderer._drawSpaceMote(cache, item, 0, 0, detailScale);
        else renderer._drawSpaceStar(cache, item, 0, 0, detailScale);
      });
      this.artwork.set(item, sprite);
    }
    ctx.drawImage(sprite.canvas, x - sprite.extent, y - sprite.extent, sprite.extent * 2, sprite.extent * 2);
  }

  drawLink(ctx, connection, x, y, dx, dy) {
    let link = this.links.get(connection);
    if (!link || link.dx !== dx || link.dy !== dy) {
      const path = this.createPath();
      path.moveTo(0, 0); path.lineTo(dx, dy);
      link = { path, dx, dy };
      this.links.set(connection, link);
    }
    ctx.save(); ctx.translate(x, y); ctx.stroke(link.path); ctx.restore();
  }
}
