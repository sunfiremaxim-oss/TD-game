export const AEGIS_SHIELD_ATTENUATION = Object.freeze({ opacity: 0.75, glow: 0.5, edgeFade: 18 });
export const AEGIS_SHIELD_ROTATION_RATIO = 0.70 / 1.7;

// Visual immersion includes the emitter, independently of damage mitigation rules.
// Blend at the boundary and use the strongest field, so overlapping shields never stack dimming.
export function getAegisCoverStrength(x, y, fields) {
  let strength = 0;
  for (const field of fields) {
    const dx = x - field.x;
    const dy = y - field.y;
    const distanceSquared = dx * dx + dy * dy;
    if (distanceSquared >= field.radius * field.radius) continue;
    const fade = Math.min(AEGIS_SHIELD_ATTENUATION.edgeFade, field.radius);
    const depth = Math.min(1, (field.radius - Math.sqrt(distanceSquared)) / fade);
    strength = Math.max(strength, depth * depth * (3 - 2 * depth));
    if (strength === 1) break;
  }
  return strength;
}

// A shared 16-frame atlas: geometry and bloom are baked only when resolution changes.
// At most two cropped image draws interpolate frames; no live mesh, mask or blur.
export const AEGIS_SHIMMER = Object.freeze({ frames: 16, columns: 4, period: 4.8, maxFrameSize: 256 });

export class AegisShieldVisual {
  constructor(createCanvas = () => document.createElement('canvas')) {
    this.createCanvas = createCanvas;
    this.texture = null;
    this.baseTexture = null;
    this.frameSize = 0;
    this.cells = null;
  }

  _getCells() {
    if (this.cells) return this.cells;
    const cells = [];
    const hexR = 16;
    const dx = Math.sqrt(3) * hexR;
    const dy = hexR * 1.5;
    const extent = 115 * 1.08;
    for (let row = -7; row <= 7; row++) {
      const y = row * dy;
      const offset = (row % 2 !== 0) ? dx / 2 : 0;
      for (let col = -6; col <= 6; col++) {
        const x = col * dx + offset;
        if (Math.hypot(x, y) > extent + hexR) continue;
        const vertices = [];
        for (let corner = 0; corner < 6; corner++) {
          const angle = -Math.PI / 2 + corner * Math.PI / 3;
          vertices.push(x + Math.cos(angle) * hexR, y + Math.sin(angle) * hexR);
        }
        // A staggered diagonal signal moves across whole cells, not circular water ripples.
        const phase = x / 172 + y / 322 + Math.sin(row * 1.4 + col * 0.5) * 0.065;
        cells.push({ vertices, phase });
      }
    }
    this.cells = cells;
    return cells;
  }

  _appendCell(ctx, cell) {
    const vertices = cell.vertices;
    ctx.moveTo(vertices[0], vertices[1]);
    for (let i = 2; i < vertices.length; i += 2) ctx.lineTo(vertices[i], vertices[i + 1]);
    ctx.closePath();
  }

  _drawBase(ctx, size) {
    const center = size / 2;
    const extent = 115 * 1.08;
    const unit = size / (extent * 2);
    ctx.setTransform(unit, 0, 0, unit, center, center);
    ctx.beginPath();
    for (const cell of this._getCells()) this._appendCell(ctx, cell);
    ctx.fillStyle = 'rgba(65, 168, 245, 0.015)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(123, 204, 255, 0.23)';
    ctx.lineWidth = 0.85;
    ctx.shadowColor = 'rgba(68, 174, 255, 0.24)';
    ctx.shadowBlur = 3 * unit;
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.globalCompositeOperation = 'destination-in';
    const feather = ctx.createRadialGradient(0, 0, 0, 0, 0, extent);
    feather.addColorStop(0, 'rgba(255, 255, 255, 0.70)');
    feather.addColorStop(0.50 / 1.08, 'rgba(255, 255, 255, 0.80)');
    feather.addColorStop(0.75 / 1.08, 'rgba(255, 255, 255, 0.85)');
    feather.addColorStop(0.90 / 1.08, 'rgba(255, 255, 255, 0.40)');
    feather.addColorStop(1 / 1.08, 'rgba(255, 255, 255, 0.06)');
    feather.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = feather;
    ctx.fillRect(-extent, -extent, extent * 2, extent * 2);
    ctx.globalCompositeOperation = 'source-over';

    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, extent);
    glow.addColorStop(0, 'rgba(68, 174, 255, 0.018)');
    glow.addColorStop(0.55 / 1.08, 'rgba(68, 174, 255, 0.030)');
    glow.addColorStop(0.78 / 1.08, 'rgba(68, 174, 255, 0.052)');
    glow.addColorStop(0.90 / 1.08, 'rgba(68, 174, 255, 0.059)');
    glow.addColorStop(0.98 / 1.08, 'rgba(68, 174, 255, 0.030)');
    glow.addColorStop(1.03 / 1.08, 'rgba(68, 174, 255, 0.011)');
    glow.addColorStop(1, 'rgba(68, 174, 255, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(-extent, -extent, extent * 2, extent * 2);
  }

  _getTexture(radius, pixelScale) {
    const density = Math.max(0.5, Math.min(2, pixelScale));
    const size = Math.max(128, Math.min(AEGIS_SHIMMER.maxFrameSize, Math.ceil(radius * 2.16 * density / 32) * 32));
    if (this.texture && this.frameSize === size) return this.texture;
    const base = this.baseTexture || this.createCanvas();
    base.width = base.height = size;
    this._drawBase(base.getContext('2d'), size);
    this.baseTexture = base;

    // The atlas is at most 1024x1024 (4 MiB), shared by all emitters in this renderer.
    const texture = this.texture || this.createCanvas();
    texture.width = size * AEGIS_SHIMMER.columns;
    texture.height = size * Math.ceil(AEGIS_SHIMMER.frames / AEGIS_SHIMMER.columns);
    const ctx = texture.getContext('2d');
    const extent = 115 * 1.08;
    const unit = size / (extent * 2);
    for (let frame = 0; frame < AEGIS_SHIMMER.frames; frame++) {
      const x = (frame % AEGIS_SHIMMER.columns) * size;
      const y = Math.floor(frame / AEGIS_SHIMMER.columns) * size;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, x, y);
      ctx.beginPath(); ctx.rect(0, 0, size, size); ctx.clip();
      ctx.drawImage(base, 0, 0);
      ctx.setTransform(unit, 0, 0, unit, x + size / 2, y + size / 2);
      const light = ctx.createRadialGradient(0, 0, 0, 0, 0, extent);
      light.addColorStop(0, 'rgba(177, 225, 255, 0.36)');
      light.addColorStop(0.70 / 1.08, 'rgba(177, 225, 255, 0.36)');
      light.addColorStop(0.90 / 1.08, 'rgba(143, 208, 255, 0.16)');
      light.addColorStop(1, 'rgba(123, 194, 255, 0)');
      for (let band = 1; band <= 3; band++) {
        ctx.beginPath();
        for (const cell of this._getCells()) {
          const signal = Math.max(0, Math.cos((cell.phase - frame / AEGIS_SHIMMER.frames) * Math.PI * 2));
          const level = Math.round(signal ** 8 * 3);
          if (level === band) this._appendCell(ctx, cell);
        }
        ctx.fillStyle = ctx.strokeStyle = light;
        ctx.globalAlpha = band / 3 * 0.13;
        ctx.fill();
        ctx.globalAlpha = band / 3;
        ctx.lineWidth = 0.95;
        ctx.shadowColor = 'rgba(80, 180, 255, 0.25)';
        ctx.shadowBlur = 2 * unit;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
      ctx.restore();
    }
    this.texture = texture;
    this.frameSize = size;
    return texture;
  }

  draw(ctx, x, y, radius, time, pixelScale = 1, phase = 0, emitterRotation = 0, intensity = 1) {
    const texture = this._getTexture(radius, pixelScale);
    const extent = radius * 1.08;
    const pulse = Math.min(1, (0.80 + Math.sin(time * 1.8 + phase) * 0.12) * intensity);
    const cycle = time / AEGIS_SHIMMER.period + phase / (Math.PI * 2);
    const position = ((cycle % 1 + 1) % 1) * AEGIS_SHIMMER.frames;
    const first = Math.floor(position);
    const blend = position - first;
    const size = this.frameSize;
    ctx.save();
    ctx.shadowBlur = 0;
    const alpha = ctx.globalAlpha * pulse;
    ctx.translate(x, y);
    ctx.rotate(-emitterRotation * AEGIS_SHIELD_ROTATION_RATIO);
    for (let layer = 0; layer < 2; layer++) {
      const weight = layer === 0 ? 1 - blend : blend;
      if (weight < 0.001) continue;
      const frame = (first + layer) % AEGIS_SHIMMER.frames;
      ctx.globalAlpha = alpha * weight;
      ctx.drawImage(texture, (frame % AEGIS_SHIMMER.columns) * size,
        Math.floor(frame / AEGIS_SHIMMER.columns) * size, size, size,
        -extent, -extent, extent * 2, extent * 2);
    }
    ctx.restore();
  }
}
