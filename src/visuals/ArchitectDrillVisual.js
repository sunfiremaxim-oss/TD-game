// Fixed-size textures shared by every drill. No gradients, paths or particles in draw().
export class ArchitectDrillVisual {
  constructor(createCanvas = () => document.createElement('canvas')) {
    this.createCanvas = createCanvas;
    this.beam = null;
    this.coils = null;
    this.tip = null;
    this.frames = 12;
  }

  _canvas(width, height) {
    const canvas = this.createCanvas(); canvas.width = width; canvas.height = height;
    return canvas;
  }

  _build() {
    this.beam = this._canvas(192, 48);
    const beam = this.beam.getContext('2d');
    const gradient = beam.createLinearGradient(0, 0, 0, 48);
    for (const [offset, color] of [[0,'#ff536e00'],[.3,'#ff536e22'],[.43,'#ff8aab99'],[.48,'#fff2df'],[.52,'#fff2df'],[.57,'#ff8aab99'],[.7,'#ff536e22'],[1,'#ff536e00']]) gradient.addColorStop(offset, color);
    beam.fillStyle = gradient; beam.fillRect(0, 0, 192, 48);

    const width = 192, height = 64;
    this.coils = this._canvas(width * this.frames, height);
    const coil = this.coils.getContext('2d');
    for (let frame = 0; frame < this.frames; frame++) {
      coil.save(); coil.translate(frame * width, 0);
      coil.shadowColor = '#ff7189'; coil.shadowBlur = 4;
      for (let strand = 0; strand < 2; strand++) {
        coil.strokeStyle = strand ? '#fff0d4' : '#ff7189'; coil.lineWidth = strand ? 1.5 : 2.5;
        coil.beginPath();
        for (let point = 0; point <= 48; point++) {
          const x = point / 48 * width;
          const y = height / 2 + Math.sin(x / width * Math.PI * 6 - frame / this.frames * Math.PI * 2 + strand * Math.PI) * 12;
          if (point) coil.lineTo(x, y); else coil.moveTo(x, y);
        }
        coil.stroke();
      }
      coil.restore();
    }

    this.tip = this._canvas(64, 64);
    const tip = this.tip.getContext('2d');
    const halo = tip.createRadialGradient(32, 32, 0, 32, 32, 30);
    halo.addColorStop(0, '#fff9e8'); halo.addColorStop(.15, '#ffd4c4ee');
    halo.addColorStop(.4, '#ff718977'); halo.addColorStop(1, '#ff536e00');
    tip.fillStyle = halo; tip.fillRect(0, 0, 64, 64);
    tip.translate(32, 32); tip.strokeStyle = '#ffe4cf'; tip.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      tip.rotate(Math.PI / 2); tip.beginPath(); tip.moveTo(7, 3); tip.lineTo(16, 5); tip.stroke();
    }
  }

  draw(ctx, x, y, angle, length, elapsed) {
    if (length <= 0) return;
    if (!this.beam) this._build();
    const phase = elapsed * 12;
    const frame = Math.floor(phase) % this.frames, blend = phase - Math.floor(phase);
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.shadowBlur = 0;
    ctx.globalCompositeOperation = 'lighter';
    const thickness = 14 + Math.sin(elapsed * 25) * .6;
    ctx.drawImage(this.beam, 0, -thickness / 2, length, thickness);
    ctx.save();
    ctx.globalAlpha *= 1 - blend;
    ctx.drawImage(this.coils, frame * 192, 0, 192, 64, 0, -9, length, 18);
    ctx.restore(); ctx.save();
    ctx.globalAlpha *= blend;
    ctx.drawImage(this.coils, (frame + 1) % this.frames * 192, 0, 192, 64, 0, -9, length, 18);
    ctx.restore();
    ctx.save(); ctx.translate(length, 0); ctx.rotate(elapsed * 8);
    ctx.drawImage(this.tip, -12, -12, 24, 24); ctx.restore();
    ctx.save(); ctx.rotate(-elapsed * 4); ctx.globalAlpha *= .7;
    ctx.drawImage(this.tip, -7, -7, 14, 14); ctx.restore();
    ctx.restore();
  }
}
