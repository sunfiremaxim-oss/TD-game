/**
 * RenderSystem.js
 * Renders the Geometric Neon Cyberpunk visual frame to HTML5 Canvas.
 * Strictly read-only: does not modify any component or entity state.
 */

import { TransformComponent } from '../components/TransformComponent.js';
import { RenderComponent } from '../components/RenderComponent.js';
import { TowerComponent } from '../components/TowerComponent.js';
import { EnemyComponent } from '../components/EnemyComponent.js';
import { HealthComponent } from '../components/HealthComponent.js';
import { AttackComponent } from '../components/AttackComponent.js';
import { TargetComponent } from '../components/TargetComponent.js';
import { ProjectileComponent } from '../components/ProjectileComponent.js';
import { GameConfig } from '../config/GameConfig.js';

export class RenderSystem {
  constructor(canvas, particleSystem) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particleSystem = particleSystem;
    this.gridOffset = 0;
    this.corePulseAngle = 0;
    this.radarRotation = 0;
    this.isRenderSystem = true;
  }

  update(world, deltaTime) {
    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;

    this.corePulseAngle += deltaTime * 2.5;
    this.radarRotation += deltaTime * 0.6;

    // 1. Clear background
    ctx.fillStyle = GameConfig.colors.background;
    ctx.fillRect(0, 0, width, height);

    // 2. Draw animated cyber grid
    this._drawGrid(ctx, width, height);

    // 3. Draw Tower range ring and tower entity
    this._drawTowerAndRange(ctx, world);

    // 3.5 Draw Aegis defensive domes on the ground
    this._drawAegisDomes(ctx, world);

    // 4. Draw enemies and health bars
    this._drawEnemies(ctx, world);

    // 4b. Draw miniature health bar under the tower core (always visible and drawn on top of enemies)
    this._drawTowerMiniHealthBar(ctx, world);

    // 5. Draw projectiles
    this._drawProjectiles(ctx, world);

    // 6. Draw particles and shockwaves
    if (this.particleSystem) {
      this._drawParticles(ctx);
      this._drawShockwaves(ctx);
      this._drawFloatingTexts(ctx);
    }

    // 7. If paused and not game over, draw cyberpunk pause indicator
    if (world.isPaused && !world.isGameOver) {
      this._drawPauseOverlay(ctx, width, height);
    }
  }

  _drawPauseOverlay(ctx, width, height) {
    ctx.save();
    // Semi-transparent dark cinematic veil
    ctx.fillStyle = 'rgba(6, 9, 18, 0.45)';
    ctx.fillRect(0, 0, width, height);

    // Glowing badge in top-center
    const badgeW = 240;
    const badgeH = 54;
    const badgeX = (width - badgeW) / 2;
    const badgeY = 32;

    ctx.fillStyle = 'rgba(10, 16, 28, 0.88)';
    ctx.strokeStyle = '#00f3ff';
    ctx.shadowColor = '#00f3ff';
    ctx.shadowBlur = 16;
    ctx.lineWidth = 2;

    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 8);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillRect(badgeX, badgeY, badgeW, badgeH);
      ctx.strokeRect(badgeX, badgeY, badgeW, badgeH);
    }

    // Title: ⏸ ПАУЗА
    ctx.font = '900 18px Orbitron, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#00f3ff';
    ctx.shadowColor = '#00f3ff';
    ctx.shadowBlur = 12;
    ctx.fillText('⏸ ПАУЗА', width / 2, badgeY + 20);

    // Subtitle: [ ПРОБЕЛ / P ]
    ctx.font = '700 11px Rajdhani, Orbitron, sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.shadowBlur = 0;
    ctx.fillText('НАЖМИТЕ ПРОБЕЛ / P ДЛЯ ИГРЫ', width / 2, badgeY + 40);

    ctx.restore();
  }

  _drawGrid(ctx, width, height) {
    const gridSize = GameConfig.canvas.gridSize || 40;
    ctx.save();
    ctx.strokeStyle = GameConfig.canvas.gridColor;
    ctx.lineWidth = 1;
    ctx.beginPath();

    for (let x = 0; x <= width; x += gridSize) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }
    for (let y = 0; y <= height; y += gridSize) {
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  _drawTowerAndRange(ctx, world) {
    const towers = world.getEntitiesWith(TowerComponent, TransformComponent, AttackComponent, RenderComponent);
    if (towers.length === 0) return;

    const towerId = towers[0];
    const trans = world.getComponent(towerId, TransformComponent);
    const attack = world.getComponent(towerId, AttackComponent);
    const render = world.getComponent(towerId, RenderComponent);
    const targetComp = world.getComponent(towerId, TargetComponent);

    ctx.save();

    // 1. Redesigned Visible Cyber Attack Range Field
    this._drawRangeField(ctx, trans.x, trans.y, attack.range);

    // 2. Target lock-on brackets
    if (targetComp && targetComp.targetEntityId) {
      const enemyTrans = world.getComponent(targetComp.targetEntityId, TransformComponent);
      if (enemyTrans) {
        this._drawLockOnReticle(ctx, enemyTrans.x, enemyTrans.y);
      }
    }

    // 3. Tower base (tech octagon)
    ctx.save();
    ctx.translate(trans.x, trans.y);
    ctx.shadowColor = render.glowColor;
    ctx.shadowBlur = render.glowBlur;

    // Outer octagonal armor
    ctx.fillStyle = '#0d1520';
    ctx.strokeStyle = render.color;
    ctx.lineWidth = 3;
    this._drawPolygonPath(ctx, 0, 0, render.radius, 8, Math.PI / 8);
    ctx.fill();
    ctx.stroke();

    // Inner mechanical details
    ctx.strokeStyle = 'rgba(0, 243, 255, 0.4)';
    ctx.lineWidth = 1.5;
    this._drawPolygonPath(ctx, 0, 0, render.radius * 0.7, 8, 0);
    ctx.stroke();

    // 4. Rotating energy core
    const corePulse = 0.85 + Math.sin(this.corePulseAngle) * 0.15;
    ctx.save();
    ctx.rotate(this.corePulseAngle * 0.5);
    ctx.fillStyle = '#00f3ff';
    ctx.shadowColor = '#00f3ff';
    ctx.shadowBlur = 15;
    this._drawPolygonPath(ctx, 0, 0, render.radius * 0.35 * corePulse, 4, 0);
    ctx.fill();
    ctx.restore();

    // 5. Weapon turret barrel pointing towards rotation
    ctx.rotate(trans.rotation);
    ctx.fillStyle = '#102233';
    ctx.strokeStyle = '#00f3ff';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#00f3ff';
    ctx.shadowBlur = 10;

    // Dual railgun barrels
    const barrelLength = render.radius + 14;
    const barrelWidth = 4;
    const barrelGap = 5;

    // Left barrel
    ctx.fillRect(4, -barrelGap - barrelWidth / 2, barrelLength, barrelWidth);
    ctx.strokeRect(4, -barrelGap - barrelWidth / 2, barrelLength, barrelWidth);

    // Right barrel
    ctx.fillRect(4, barrelGap - barrelWidth / 2, barrelLength, barrelWidth);
    ctx.strokeRect(4, barrelGap - barrelWidth / 2, barrelLength, barrelWidth);

    // Muzzle capacitor
    ctx.fillStyle = '#00f3ff';
    ctx.fillRect(barrelLength - 2, -barrelGap - barrelWidth / 2, 4, barrelWidth);
    ctx.fillRect(barrelLength - 2, barrelGap - barrelWidth / 2, 4, barrelWidth);

    ctx.restore();
    ctx.restore();
  }

  _drawTowerMiniHealthBar(ctx, world) {
    const towers = world.getEntitiesWith(TowerComponent, TransformComponent, RenderComponent, HealthComponent);
    if (towers.length === 0) return;

    const towerId = towers[0];
    const trans = world.getComponent(towerId, TransformComponent);
    const render = world.getComponent(towerId, RenderComponent);
    const health = world.getComponent(towerId, HealthComponent);
    if (!trans || !health) return;

    const x = trans.x;
    const y = trans.y + (render ? render.radius : 26) + 12;
    const barWidth = 52;
    const barHeight = 5;
    const halfW = barWidth / 2;
    const pct = Math.max(0, Math.min(1, health.current / health.max));

    ctx.save();

    // High-contrast cyber background with dark stroke
    ctx.fillStyle = 'rgba(5, 8, 14, 0.9)';
    ctx.fillRect(x - halfW - 1, y - 1, barWidth + 2, barHeight + 2);

    ctx.strokeStyle = 'rgba(0, 243, 255, 0.45)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x - halfW - 1, y - 1, barWidth + 2, barHeight + 2);

    // Dynamic glowing health fill: green -> yellow -> red alert
    let fillColor = '#00ff88';
    if (pct <= 0.25) {
      fillColor = '#ff0055';
    } else if (pct <= 0.5) {
      fillColor = '#ffe600';
    }

    ctx.fillStyle = fillColor;
    ctx.shadowColor = fillColor;
    ctx.shadowBlur = 8;
    ctx.fillRect(x - halfW, y, barWidth * pct, barHeight);

    ctx.restore();
  }

  _drawRangeField(ctx, cx, cy, range) {
    ctx.save();

    // 1. Cyberpunk radial gradient aura
    const radGrad = ctx.createRadialGradient(cx, cy, range * 0.15, cx, cy, range);
    radGrad.addColorStop(0, 'rgba(0, 243, 255, 0.005)');
    radGrad.addColorStop(0.65, 'rgba(0, 243, 255, 0.03)');
    radGrad.addColorStop(0.9, 'rgba(0, 243, 255, 0.07)');
    radGrad.addColorStop(1, 'rgba(0, 243, 255, 0.16)');

    ctx.fillStyle = radGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, range, 0, Math.PI * 2);
    ctx.fill();

    // 2. Inner concentric distance rings (Radar grid)
    // 50% distance ring
    ctx.strokeStyle = 'rgba(0, 243, 255, 0.14)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 8]);
    ctx.beginPath();
    ctx.arc(cx, cy, range * 0.5, 0, Math.PI * 2);
    ctx.stroke();

    // 75% distance ring
    ctx.strokeStyle = 'rgba(0, 243, 255, 0.18)';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 10]);
    ctx.beginPath();
    ctx.arc(cx, cy, range * 0.75, 0, Math.PI * 2);
    ctx.stroke();

    // 3. Animated outer perimeter (tech dashes)
    ctx.strokeStyle = '#00f3ff';
    ctx.shadowColor = '#00f3ff';
    ctx.shadowBlur = 14;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([16, 12, 6, 12]);
    ctx.lineDashOffset = -this.radarRotation * 40;
    ctx.beginPath();
    ctx.arc(cx, cy, range, 0, Math.PI * 2);
    ctx.stroke();

    // Counter-rotating inner perimeter accent
    ctx.strokeStyle = 'rgba(0, 243, 255, 0.35)';
    ctx.shadowBlur = 6;
    ctx.lineWidth = 1;
    ctx.setLineDash([24, 24]);
    ctx.lineDashOffset = this.radarRotation * 25;
    ctx.beginPath();
    ctx.arc(cx, cy, range - 5, 0, Math.PI * 2);
    ctx.stroke();

    ctx.setLineDash([]);

    // 4. Tactical radar crosshair ticks (8 compass points)
    ctx.strokeStyle = '#00f3ff';
    ctx.shadowColor = '#00f3ff';
    ctx.shadowBlur = 10;
    ctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      const angle = this.radarRotation * 0.25 + (i * Math.PI) / 4;
      const x1 = cx + (range - 8) * Math.cos(angle);
      const y1 = cy + (range - 8) * Math.sin(angle);
      const x2 = cx + (range + 8) * Math.cos(angle);
      const y2 = cy + (range + 8) * Math.sin(angle);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    // 5. Tactical range readout pill
    const tagAngle = -Math.PI / 2 + 0.38;
    const tagX = cx + (range + 16) * Math.cos(tagAngle);
    const tagY = cy + (range + 16) * Math.sin(tagAngle);

    ctx.font = '900 11px Orbitron, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#00f3ff';
    ctx.shadowColor = '#00f3ff';
    ctx.shadowBlur = 10;
    ctx.fillText(`ZONE: ${Math.round(range)}px`, tagX, tagY);

    ctx.restore();
  }

  _drawLockOnReticle(ctx, x, y) {
    ctx.save();
    ctx.strokeStyle = '#00f3ff';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = '#00f3ff';
    ctx.shadowBlur = 8;

    const r = 24;
    const corner = 6;

    // 4 corner reticle brackets
    // Top-Left
    ctx.beginPath();
    ctx.moveTo(x - r + corner, y - r);
    ctx.lineTo(x - r, y - r);
    ctx.lineTo(x - r, y - r + corner);
    ctx.stroke();

    // Top-Right
    ctx.beginPath();
    ctx.moveTo(x + r - corner, y - r);
    ctx.lineTo(x + r, y - r);
    ctx.lineTo(x + r, y - r + corner);
    ctx.stroke();

    // Bottom-Left
    ctx.beginPath();
    ctx.moveTo(x - r + corner, y + r);
    ctx.lineTo(x - r, y + r);
    ctx.lineTo(x - r, y + r - corner);
    ctx.stroke();

    // Bottom-Right
    ctx.beginPath();
    ctx.moveTo(x + r - corner, y + r);
    ctx.lineTo(x + r, y + r);
    ctx.lineTo(x + r, y + r - corner);
    ctx.stroke();

    ctx.restore();
  }

  _drawAegisDomes(ctx, world) {
    const enemies = world.getEntitiesWith(EnemyComponent, TransformComponent, HealthComponent);
    for (const id of enemies) {
      const enemyComp = world.getComponent(id, EnemyComponent);
      if (enemyComp && enemyComp.type === 'aegis') {
        const health = world.getComponent(id, HealthComponent);
        if (!health || health.current <= 0) continue;

        const trans = world.getComponent(id, TransformComponent);
        if (!trans) continue;

        const r = enemyComp.shieldDomeRadius || 115;

        ctx.save();
        // 1. Radial gradient defense field
        const grad = ctx.createRadialGradient(trans.x, trans.y, r * 0.15, trans.x, trans.y, r);
        grad.addColorStop(0, 'rgba(0, 229, 255, 0.02)');
        grad.addColorStop(0.7, 'rgba(0, 229, 255, 0.08)');
        grad.addColorStop(1, 'rgba(0, 229, 255, 0.20)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(trans.x, trans.y, r, 0, Math.PI * 2);
        ctx.fill();

        // 2. Animated outer tech ring
        ctx.strokeStyle = '#00e5ff';
        ctx.shadowColor = '#00e5ff';
        ctx.shadowBlur = 12;
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 8, 4, 8]);
        ctx.lineDashOffset = -this.radarRotation * 30;
        ctx.beginPath();
        ctx.arc(trans.x, trans.y, r, 0, Math.PI * 2);
        ctx.stroke();

        // 3. Counter-rotating inner ring
        ctx.strokeStyle = 'rgba(0, 229, 255, 0.35)';
        ctx.shadowBlur = 4;
        ctx.lineWidth = 1;
        ctx.setLineDash([16, 16]);
        ctx.lineDashOffset = this.radarRotation * 20;
        ctx.beginPath();
        ctx.arc(trans.x, trans.y, r - 5, 0, Math.PI * 2);
        ctx.stroke();

        ctx.setLineDash([]);

        // 4. Subtle Aegis status badge
        ctx.font = '900 9px Orbitron, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#00e5ff';
        ctx.shadowColor = '#00e5ff';
        ctx.shadowBlur = 6;
        ctx.fillText('AEGIS FIELD -50%', trans.x, trans.y - r - 8);

        ctx.restore();
      }
    }
  }

  _drawEnemies(ctx, world) {
    const enemies = world.getEntitiesWith(EnemyComponent, TransformComponent, RenderComponent, HealthComponent);

    for (const id of enemies) {
      const trans = world.getComponent(id, TransformComponent);
      const render = world.getComponent(id, RenderComponent);
      const health = world.getComponent(id, HealthComponent);
      const enemy = world.getComponent(id, EnemyComponent);

      ctx.save();
      ctx.translate(trans.x, trans.y);
      ctx.rotate(trans.rotation);

      ctx.shadowColor = render.glowColor;
      ctx.shadowBlur = render.glowBlur;
      ctx.fillStyle = '#0a0d14';
      ctx.strokeStyle = render.color;
      ctx.lineWidth = 2.5;

      if (enemy.type === 'fighter') {
        // Fighter: aerodynamic dart shape
        this._drawDartPath(ctx, render.radius);
        ctx.fill();
        ctx.stroke();
      } else if (enemy.type === 'aegis') {
        // Aegis: 5-sided pentagon with concentric inner core
        this._drawPolygonPath(ctx, 0, 0, render.radius, 5, -Math.PI / 2);
        ctx.fill();
        ctx.stroke();

        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.lineWidth = 1.2;
        this._drawPolygonPath(ctx, 0, 0, render.radius * 0.52, 5, -Math.PI / 2);
        ctx.stroke();
        ctx.restore();
      } else if (enemy.type === 'splitter') {
        // Splitter: green triangular fractal
        this._drawSierpinskiTriangle(ctx, render.radius);
      } else if (enemy.type === 'splitter_shard') {
        // Splitter Shard: mini green triangle
        this._drawPolygonPath(ctx, 0, 0, render.radius, 3, -Math.PI / 2);
        ctx.fill();
        ctx.stroke();
      } else if (enemy.type === 'blinker') {
        // Blinker: white/cyan lightning zigzag vector
        this._drawLightningBolt(ctx, render.radius);
        ctx.fill();
        ctx.stroke();
      } else if (enemy.type === 'boss_architect') {
        // Boss Architect: giant star fractal
        this._drawStarFractal(ctx, render.radius);
      } else if (enemy.type === 'boss_shield') {
        // Boss orbital shield segment
        this._drawShieldSegment(ctx, render.radius);
      } else {
        // Scout (3-sided), Tank (6-sided), Sniper (4-sided diamond)
        this._drawPolygonPath(ctx, 0, 0, render.radius, render.sides, 0);
        ctx.fill();
        ctx.stroke();

        // Inner geometric accent
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 1;
        if (enemy.type === 'tank') {
          this._drawPolygonPath(ctx, 0, 0, render.radius * 0.55, 6, Math.PI / 6);
          ctx.stroke();
        } else if (enemy.type === 'sniper') {
          // Sniper charging optic core
          ctx.fillStyle = render.color;
          ctx.beginPath();
          ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.restore();

      // Health bar above enemy
      if (enemy.type === 'boss_architect') {
        // Persistent clean health bar for boss (pure bar, no text or numbers)
        this._drawBossHealthBar(ctx, trans.x, trans.y - render.radius - 12, 110, health.current, health.max);
      } else if (health.current < health.max) {
        this._drawHealthBar(ctx, trans.x, trans.y - render.radius - 8, render.radius * 2, health.current, health.max);
      }
    }
  }

  _drawSierpinskiTriangle(ctx, radius) {
    // Outer triangle
    this._drawPolygonPath(ctx, 0, 0, radius, 3, -Math.PI / 2);
    ctx.fill();
    ctx.stroke();

    // Inverted inner cutout triangle to form Sierpinski fractal pattern
    ctx.save();
    ctx.strokeStyle = 'rgba(0, 255, 102, 0.85)';
    ctx.lineWidth = 1.3;
    this._drawPolygonPath(ctx, 0, 0, radius * 0.5, 3, Math.PI / 2);
    ctx.stroke();

    // Central core accent dot
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  _drawLightningBolt(ctx, radius) {
    const r = radius;
    ctx.beginPath();
    // Sharp neon zigzag bolt facing along +X axis
    ctx.moveTo(r * 1.35, 0);          // Forward tip
    ctx.lineTo(r * 0.1, -r * 0.75);    // Top forward angle
    ctx.lineTo(r * 0.22, -r * 0.22);   // Top inner notch
    ctx.lineTo(-r * 0.8, -r * 0.85);   // Top tail
    ctx.lineTo(-r * 0.25, 0);          // Tail center notch
    ctx.lineTo(-r * 0.85, r * 0.8);    // Bottom tail
    ctx.lineTo(0.1, r * 0.2);          // Bottom inner notch
    ctx.lineTo(-0.05, r * 0.7);        // Bottom forward angle
    ctx.closePath();
  }

  _drawStarFractal(ctx, radius) {
    // Outer 8-point star
    this._drawStarPath(ctx, 0, 0, 8, radius, radius * 0.55);
    ctx.fill();
    ctx.stroke();

    // Inner counter-rotated 8-point star
    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    this._drawStarPath(ctx, 0, 0, 8, radius * 0.5, radius * 0.25, Math.PI / 8);
    ctx.stroke();

    // Central pulsating core
    const pulse = Math.sin(this.corePulseAngle * 2.5) * 2;
    ctx.fillStyle = '#ff0055';
    ctx.shadowColor = '#ff0055';
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(0, 0, 7 + pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  _drawStarPath(ctx, cx, cy, points, outerR, innerR, angleOffset = 0) {
    ctx.beginPath();
    const total = points * 2;
    for (let i = 0; i < total; i++) {
      const angle = angleOffset + (i * Math.PI) / points;
      const r = i % 2 === 0 ? outerR : innerR;
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  _drawShieldSegment(ctx, radius) {
    const w = radius * 1.4;
    const h = radius * 0.7;
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(-w, -h / 2, w * 2, h, 3);
    } else {
      ctx.rect(-w, -h / 2, w * 2, h);
    }
    ctx.fill();
    ctx.stroke();

    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-w * 0.6, 0);
    ctx.lineTo(w * 0.6, 0);
    ctx.stroke();
    ctx.restore();
  }

  _drawBossHealthBar(ctx, x, y, width, current, max) {
    const barWidth = Math.max(110, width);
    const height = 8;
    const halfW = barWidth / 2;
    const pct = Math.max(0, Math.min(1, current / max));

    ctx.save();
    // High-contrast dark background
    ctx.fillStyle = 'rgba(5, 8, 14, 0.95)';
    ctx.fillRect(x - halfW - 2, y - 2, barWidth + 4, height + 4);

    ctx.strokeStyle = '#ff0055';
    ctx.shadowColor = '#ff0055';
    ctx.shadowBlur = 8;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x - halfW - 2, y - 2, barWidth + 4, height + 4);

    // Crimson neon fill
    ctx.fillStyle = '#ff0055';
    ctx.fillRect(x - halfW, y, barWidth * pct, height);

    ctx.restore();
  }

  _drawDartPath(ctx, radius) {
    ctx.beginPath();
    ctx.moveTo(radius * 1.3, 0); // Pointy tip forward
    ctx.lineTo(-radius, radius * 0.9); // Wing tip right
    ctx.lineTo(-radius * 0.5, 0); // Inner notch
    ctx.lineTo(-radius, -radius * 0.9); // Wing tip left
    ctx.closePath();
  }

  _drawHealthBar(ctx, x, y, width, current, max) {
    const barWidth = Math.max(28, width);
    const height = 5;
    const halfW = barWidth / 2;
    const pct = Math.max(0, Math.min(1, current / max));

    ctx.save();
    // High-contrast background with dark stroke
    ctx.fillStyle = 'rgba(5, 8, 14, 0.9)';
    ctx.fillRect(x - halfW - 1, y - 1, barWidth + 2, height + 2);

    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    ctx.strokeRect(x - halfW - 1, y - 1, barWidth + 2, height + 2);

    // Glowing neon fill
    ctx.fillStyle = pct > 0.4 ? '#00ff66' : '#ff0055';
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 6;
    ctx.fillRect(x - halfW, y, barWidth * pct, height);
    ctx.restore();
  }

  _drawProjectiles(ctx, world) {
    const projectiles = world.getEntitiesWith(ProjectileComponent, TransformComponent, RenderComponent);

    for (const id of projectiles) {
      const trans = world.getComponent(id, TransformComponent);
      const render = world.getComponent(id, RenderComponent);
      const proj = world.getComponent(id, ProjectileComponent);

      ctx.save();
      ctx.translate(trans.x, trans.y);
      ctx.rotate(trans.rotation);

      ctx.shadowColor = render.glowColor;
      ctx.shadowBlur = render.glowBlur;
      ctx.fillStyle = render.color;

      if (!proj.isEnemy) {
        // Player neon bolt
        const length = proj.isCrit ? 16 : 12;
        const width = proj.isCrit ? 5 : 3.5;
        ctx.fillRect(-length / 2, -width / 2, length, width);
      } else {
        // Sniper beam sphere
        ctx.beginPath();
        ctx.arc(0, 0, render.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }
  }

  _drawParticles(ctx) {
    const particles = this.particleSystem.getParticles();
    for (const p of particles) {
      const alpha = Math.max(0, Math.min(1, p.life / p.maxLife));
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 8;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      ctx.restore();
    }
  }

  _drawShockwaves(ctx) {
    const shockwaves = this.particleSystem.getShockwaves();
    for (const sw of shockwaves) {
      const alpha = Math.max(0, Math.min(1, sw.life / sw.maxLife));
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = sw.color;
      ctx.lineWidth = sw.lineWidth;
      ctx.shadowColor = sw.color;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  _drawFloatingTexts(ctx) {
    const texts = this.particleSystem.getFloatingTexts();
    for (const ft of texts) {
      const alpha = Math.max(0, Math.min(1, ft.life / ft.maxLife));
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = `900 ${ft.fontSize}px 'Rajdhani', 'Orbitron', 'Segoe UI', monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // 1. High-contrast dark outline so text pops on any background
      ctx.lineWidth = ft.isCrit ? 4 : 3;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.95)';
      ctx.shadowBlur = 0; // clear shadow for crisp border
      ctx.strokeText(ft.text, ft.x, ft.y);

      // 2. Bright glowing fill
      ctx.fillStyle = ft.color;
      ctx.shadowColor = ft.color;
      ctx.shadowBlur = ft.isCrit ? 16 : 8;
      ctx.fillText(ft.text, ft.x, ft.y);

      ctx.restore();
    }
  }

  _drawPolygonPath(ctx, cx, cy, radius, sides, startAngle = 0) {
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
      const a = startAngle + (i * 2 * Math.PI) / sides;
      const x = cx + radius * Math.cos(a);
      const y = cy + radius * Math.sin(a);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }
}
