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
import { MenuCoreVisual } from '../visuals/MenuCoreVisual.js';
import { RangeFieldVisual, TowerVisual, EnemyVisualCache, ProjectileVisualCache } from '../visuals/BattleVisualCache.js';
import { SpaceVisualCache } from '../visuals/SpaceVisualCache.js';
import { drawArchitectBody, drawArchitectCore, getArchitectArmorOpen } from '../visuals/ArchitectVisual.js';
import { ArchitectDrillVisual } from '../visuals/ArchitectDrillVisual.js';
import { ArchitectDrillComponent } from '../components/ArchitectDrillComponent.js';
import { ArchitectSiegeComponent } from '../components/ArchitectSiegeComponent.js';
import { CarrierComponent } from '../components/CarrierComponent.js';
import { drawCarrierBody } from '../visuals/CarrierVisual.js';
import { CircleColliderComponent } from '../components/CircleColliderComponent.js';
import { getHealthRatio, getHealthColor } from '../visuals/HealthVisuals.js';
import { drawBossHullHealth } from '../visuals/BossHealthVisual.js';
import { drawScoutBossBody } from '../visuals/ScoutBossVisual.js';
import { drawRailgunBody, RailgunBeamVisual } from '../visuals/RailgunVisual.js';
import { RailgunComponent } from '../components/RailgunComponent.js';
import { t } from '../i18n/I18n.js';
import { AegisShieldVisual, AEGIS_SHIELD_ATTENUATION, getAegisCoverStrength } from '../visuals/AegisShieldVisual.js';

export class RenderSystem {
  constructor(canvas, particleSystem, menuCanvas = null) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particleSystem = particleSystem;
    this.menuCanvas = menuCanvas;
    this.menuCtx = menuCanvas?.getContext('2d');
    this.menuCoreVisual = new MenuCoreVisual();
    this.rangeFieldVisual = new RangeFieldVisual();
    this.towerVisual = new TowerVisual();
    this.enemyVisualCache = new EnemyVisualCache();
    this.architectDrillVisual = new ArchitectDrillVisual();
    this.railgunBeamVisual = new RailgunBeamVisual();
    this.projectileVisualCache = new ProjectileVisualCache();
    this.spaceVisualCache = new SpaceVisualCache();
    this.gridOffset = 0;
    this.corePulseAngle = 0;
    this.radarRotation = 0;
    this.isRenderSystem = true;
    this.aegisShieldVisual = new AegisShieldVisual();
    this._compactPauseQuery = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(max-width: 1100px), (max-height: 600px)') : null;

    this._initParallaxSpace();
  }

  update(world, deltaTime) {
    const ctx = this.ctx;
    const width = this.canvas.viewportWidth || this.canvas.width;
    const height = this.canvas.viewportHeight || this.canvas.height;
    const pixelRatio = this.canvas.pixelRatio || 1;
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    const scale = world.renderScale || 1.0;

    this.corePulseAngle += deltaTime * 2.5;
    this.radarRotation += deltaTime * 0.6;

    // Advance cosmic parallax drift (slow majestic drift across deep space)
    this.spaceTime += deltaTime;
    this.parallaxDriftX += deltaTime * 8.0;
    this.parallaxDriftY += deltaTime * 4.0;

    // 1. Draw Deep Cyber-Space with 3-Layer Parallax & Nebulae
    this._drawSpaceBackground(ctx, width, height, world);

    // The command hub uses the real tower geometry in its own layout-sized preview.
    if (world.inMenu && this.menuCanvas) {
      this._drawMenuCore(world);
      return;
    }

    // Virtual Camera Scale for Mobile Viewport Support
    ctx.save();
    if (scale !== 1.0) {
      ctx.scale(scale, scale);
    }

    // 2. Draw the tower's tactical grid
    this._drawTacticalGrids(ctx, world, width, height);

    // 3. Draw Tower range ring and tower entity
    this._drawTowerAndRange(ctx, world);
    this._drawArchitectDrills(ctx, world);
    this._drawRailgunBeams(ctx,world);

    // 4. Draw enemies and health bars
    this._drawEnemies(ctx, world);

    // The translucent shell encloses the emitter and allies, rather than sitting behind them.
    this._drawAegisDomes(ctx, world);

    // 5. Draw projectiles
    this._drawProjectiles(ctx, world);

    // 6. Draw particles and shockwaves
    if (this.particleSystem) {
      this._drawParticles(ctx);
      this._drawShockwaves(ctx);
      this._drawFloatingTexts(ctx);
    }

    ctx.restore();

    // 7. If paused, not game over, and not in main menu, draw cyberpunk pause indicator
    if (world.isPaused && !world.isGameOver && !world.inMenu) {
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
    const compact = this._compactPauseQuery?.matches;
    // Compact HUD stacks the menu above the wallet; place the hint below both.
    const badgeY = compact ? Math.max(0, Math.min(144, height - badgeH - 8)) : 32;

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
    ctx.font = '400 20px "WDXL Lubrifont SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#00f3ff';
    ctx.shadowColor = '#00f3ff';
    ctx.shadowBlur = 12;
    ctx.fillText(t('⏸ ПАУЗА'), width / 2, badgeY + 20);

    // Compact controls use the same play icon as the hint.
    ctx.font = '400 12px "WDXL Lubrifont SC", sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.shadowBlur = 0;
    ctx.fillText(t(compact ? 'НАЖМИ ▶, ЧТОБЫ ПРОДОЛЖИТЬ' : 'НАЖМИТЕ ▶ В ПАНЕЛИ УПРАВЛЕНИЯ'), width / 2, badgeY + 40);

    ctx.restore();
  }

  _drawTacticalGrids(ctx, world, width, height) {
    if (this.rangeFieldVisual) return; // Cached together with the range field.
    // 1. Draw tactical coordinate grid inside the tower's attack range circle
    const towers = world.getEntitiesWith(TowerComponent, TransformComponent, AttackComponent);
    if (towers.length > 0) {
      const trans = world.getComponent(towers[0], TransformComponent);
      const attack = world.getComponent(towers[0], AttackComponent);
      if (attack && attack.range > 0) {
        this._drawTowerGrid(ctx, trans.x, trans.y, attack.range);
      }
    }
  }

  _drawTowerGrid(ctx, cx, cy, range) {
    const gridSize = GameConfig.canvas.gridSize || 40;
    ctx.save();

    // Clip strictly to tower attack range
    ctx.beginPath();
    ctx.arc(cx, cy, range, 0, Math.PI * 2);
    ctx.clip();

    // Cyan tactical coordinate grid lines
    ctx.strokeStyle = 'rgba(0, 243, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();

    const minX = Math.floor((cx - range) / gridSize) * gridSize;
    const maxX = Math.ceil((cx + range) / gridSize) * gridSize;
    const minY = Math.floor((cy - range) / gridSize) * gridSize;
    const maxY = Math.ceil((cy + range) / gridSize) * gridSize;

    for (let x = minX; x <= maxX; x += gridSize) {
      ctx.moveTo(x, cy - range);
      ctx.lineTo(x, cy + range);
    }
    for (let y = minY; y <= maxY; y += gridSize) {
      ctx.moveTo(cx - range, y);
      ctx.lineTo(cx + range, y);
    }
    ctx.stroke();

    // Subtle tactical intersection crosses (+)
    ctx.fillStyle = 'rgba(0, 243, 255, 0.22)';
    for (let x = minX; x <= maxX; x += gridSize) {
      for (let y = minY; y <= maxY; y += gridSize) {
        if (Math.hypot(x - cx, y - cy) <= range - 2) {
          ctx.fillRect(x - 2, y, 5, 1);
          ctx.fillRect(x, y - 2, 1, 5);
        }
      }
    }

    ctx.restore();
  }

  _initParallaxSpace() {
    this.spaceTime = 0;
    this.parallaxDriftX = 0;
    this.parallaxDriftY = 0;

    // Layer 1: Distant micro-stars (deep space backdrop)
    this.distantStars = [];
    for (let i = 0; i < 95; i++) {
      this.distantStars.push({
        x: Math.random() * 2400,
        y: Math.random() * 1600,
        size: Math.random() * 1.3 + 0.6,
        alpha: Math.random() * 0.45 + 0.25,
        twinkleSpeed: Math.random() * 1.5 + 0.8,
        twinklePhase: Math.random() * Math.PI * 2,
        color: Math.random() < 0.6 ? '#ffffff' : (Math.random() < 0.5 ? '#a5f3fc' : '#c084fc')
      });
    }

    // Layer 2: Mid-distance geometric stars (diamonds, crosses, clusters)
    this.midStars = [];
    for (let i = 0; i < 42; i++) {
      const type = Math.random() < 0.45 ? 'diamond' : (Math.random() < 0.45 ? 'cross' : 'dot');
      this.midStars.push({
        x: Math.random() * 2400,
        y: Math.random() * 1600,
        size: Math.random() * 2.2 + 1.8,
        alpha: Math.random() * 0.45 + 0.45,
        twinkleSpeed: Math.random() * 2.0 + 1.2,
        twinklePhase: Math.random() * Math.PI * 2,
        color: Math.random() < 0.55 ? '#00f3ff' : (Math.random() < 0.6 ? '#00ffcc' : '#f472b6'),
        type
      });
    }

    // Predefined geometric constellation connections between nearby mid-stars
    this.constellations = [];
    for (let i = 0; i < this.midStars.length; i++) {
      for (let j = i + 1; j < this.midStars.length; j++) {
        const dx = this.midStars[i].x - this.midStars[j].x;
        const dy = this.midStars[i].y - this.midStars[j].y;
        const d = Math.hypot(dx, dy);
        if (d > 70 && d < 180 && this.constellations.length < 20) {
          this.constellations.push([i, j]);
        }
      }
    }

    // Layer 3: Foreground cyber-motes (drifting space dust / energy motes)
    this.foregroundMotes = [];
    for (let i = 0; i < 20; i++) {
      this.foregroundMotes.push({
        x: Math.random() * 2400,
        y: Math.random() * 1600,
        size: Math.random() * 2.5 + 2.0,
        alpha: Math.random() * 0.35 + 0.45,
        pulseSpeed: Math.random() * 2.2 + 1.0,
        pulsePhase: Math.random() * Math.PI * 2,
        color: Math.random() < 0.65 ? '#00f3ff' : '#ffe600'
      });
    }

    // Nebulae: 3 cosmic color clouds with slow orbital drift
    this.nebulae = [
      {
        baseX: 0.28,
        baseY: 0.32,
        radius: 480,
        color: 'rgba(0, 180, 216, 0.055)',
        accent: 'rgba(0, 243, 255, 0.015)',
        phase: 0
      },
      {
        baseX: 0.72,
        baseY: 0.68,
        radius: 520,
        color: 'rgba(147, 51, 234, 0.048)',
        accent: 'rgba(217, 70, 239, 0.012)',
        phase: 2.1
      },
      {
        baseX: 0.50,
        baseY: 0.50,
        radius: 380,
        color: 'rgba(6, 78, 119, 0.06)',
        accent: 'rgba(0, 243, 255, 0.02)',
        phase: 4.2
      }
    ];
  }

  _drawSpaceBackground(ctx, width, height, world) {
    ctx.save();

    // 1. Deep cosmic void
    ctx.fillStyle = '#050711';
    ctx.fillRect(0, 0, width, height);

    const VIRT_W = 2400;
    const VIRT_H = 1600;
    // Positions fill the viewport, but decorative detail must shrink with gameplay.
    // Otherwise fixed CSS-pixel stars dwarf enemies on a phone's virtual camera.
    const detailScale = Math.min(1, world.renderScale || 1);
    const spaceCache = this.spaceVisualCache;
    const pixelRatio = this.canvas?.pixelRatio || 1;
    spaceCache?.prepare(detailScale, pixelRatio);

    // 2. Cosmic nebulae clouds (slow breathing radial gradients)
    for (const neb of this.nebulae) {
      const nebX = (neb.baseX * width + Math.sin(this.spaceTime * 0.2 + neb.phase) * 60 * detailScale - this.parallaxDriftX * 0.15 * detailScale);
      const nebY = (neb.baseY * height + Math.cos(this.spaceTime * 0.18 + neb.phase) * 45 * detailScale - this.parallaxDriftY * 0.15 * detailScale);
      const wrapX = ((nebX % width) + width) % width;
      const wrapY = ((nebY % height) + height) % height;

      const r = (neb.radius + Math.sin(this.spaceTime * 0.35 + neb.phase) * 35) * detailScale;
      if (spaceCache?.nebulaeEnabled) spaceCache.drawNebula(ctx, this, neb, wrapX, wrapY, r);
      else this._drawSpaceNebula(ctx, neb, wrapX, wrapY, r);
    }

    // 3. Layer 1: Distant Micro-Stars (Parallax factor: 0.35, wrapped in virtual 2400x1600 space)
    const drift1X = this.parallaxDriftX * 0.35;
    const drift1Y = this.parallaxDriftY * 0.35;
    for (const s of this.distantStars) {
      const vx = ((s.x - drift1X) % VIRT_W + VIRT_W) % VIRT_W;
      const vy = ((s.y - drift1Y) % VIRT_H + VIRT_H) % VIRT_H;
      const x = (vx / VIRT_W) * width;
      const y = (vy / VIRT_H) * height;
      const twinkle = 0.7 + 0.3 * Math.sin(this.spaceTime * s.twinkleSpeed + s.twinklePhase);
      ctx.globalAlpha = Math.max(0.1, Math.min(1, s.alpha * twinkle));
      ctx.fillStyle = s.color;
      ctx.fillRect(x, y, s.size * detailScale, s.size * detailScale);
    }

    // 4. Layer 2: Mid-Distance Geometric Stars & Constellations (Parallax factor: 0.70)
    const drift2X = this.parallaxDriftX * 0.70;
    const drift2Y = this.parallaxDriftY * 0.70;

    // Calculate normalized screen coordinates for all mid-stars to preserve constellation topology
    // Reuse coordinate storage rather than allocating an array and 42 objects each frame.
    if (this._midScreenCoords?.length !== this.midStars.length * 2) {
      this._midScreenCoords = new Float64Array(this.midStars.length * 2);
    }
    const midScreenCoords = this._midScreenCoords;
    for (let i = 0; i < this.midStars.length; i++) {
      const s = this.midStars[i];
      const vx = ((s.x - drift2X) % VIRT_W + VIRT_W) % VIRT_W;
      const vy = ((s.y - drift2Y) % VIRT_H + VIRT_H) % VIRT_H;
      midScreenCoords[i * 2] = (vx / VIRT_W) * width;
      midScreenCoords[i * 2 + 1] = (vy / VIRT_H) * height;
    }

    // Draw faint constellation links between nearby stars without edge stretching
    ctx.lineWidth = 0.8 * detailScale;
    ctx.strokeStyle = 'rgba(0, 243, 255, 0.08)';
    const maxLinkDistX = width * 0.25;
    const maxLinkDistY = height * 0.25;
    for (const connection of this.constellations) {
      const [i, j] = connection;
      const x1 = midScreenCoords[i * 2], y1 = midScreenCoords[i * 2 + 1];
      const x2 = midScreenCoords[j * 2], y2 = midScreenCoords[j * 2 + 1];

      // Only draw line if stars haven't wrapped across opposite screen boundaries
      if (Math.abs(x1 - x2) < maxLinkDistX && Math.abs(y1 - y2) < maxLinkDistY) {
        if (spaceCache) {
          // Relative geometry is constant between resizes; subtracting drifting
          // screen coordinates would introduce tiny float changes into the key.
          spaceCache.drawLink(ctx, connection, x1, y1,
            (this.midStars[j].x - this.midStars[i].x) / VIRT_W * width,
            (this.midStars[j].y - this.midStars[i].y) / VIRT_H * height);
        } else {
          ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        }
      }
    }

    // Draw mid-distance stars (diamonds, crosses, glowing dots)
    for (let i = 0; i < this.midStars.length; i++) {
      const s = this.midStars[i];
      const x = midScreenCoords[i * 2], y = midScreenCoords[i * 2 + 1];
      const twinkle = 0.65 + 0.35 * Math.sin(this.spaceTime * s.twinkleSpeed + s.twinklePhase);
      const alpha = Math.max(0.15, Math.min(1, s.alpha * twinkle));

      ctx.globalAlpha = alpha;
      if (spaceCache) spaceCache.draw(ctx, this, s, x, y, detailScale, pixelRatio);
      else this._drawSpaceStar(ctx, s, x, y, detailScale);
    }

    // 5. Layer 3: Foreground Cyber Motes (Parallax factor: 1.25, wrapped in virtual space)
    const drift3X = this.parallaxDriftX * 1.25;
    const drift3Y = this.parallaxDriftY * 1.25;
    for (const m of this.foregroundMotes) {
      const vx = ((m.x - drift3X) % VIRT_W + VIRT_W) % VIRT_W;
      const vy = ((m.y - drift3Y) % VIRT_H + VIRT_H) % VIRT_H;
      const x = (vx / VIRT_W) * width;
      const y = (vy / VIRT_H) * height;
      const pulse = 0.65 + 0.35 * Math.sin(this.spaceTime * m.pulseSpeed + m.pulsePhase);
      const alpha = Math.max(0.1, Math.min(1, m.alpha * pulse));

      ctx.save();
      ctx.globalAlpha = alpha;
      if (spaceCache) spaceCache.draw(ctx, this, m, x, y, detailScale, pixelRatio, true);
      else this._drawSpaceMote(ctx, m, x, y, detailScale);
      ctx.restore();
    }

    ctx.restore();
  }

  _drawSpaceNebula(ctx, neb, x, y, radius) {
    const gradient = ctx.createRadialGradient(x, y, radius * 0.05, x, y, radius);
    gradient.addColorStop(0, neb.color);
    gradient.addColorStop(0.65, neb.accent);
    gradient.addColorStop(1, 'rgba(5, 7, 17, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
  }

  _drawSpaceStar(ctx, s, x, y, detailScale) {
    ctx.fillStyle = s.color;
    ctx.strokeStyle = s.color;
    if (s.type === 'diamond') {
      // 4-pointed diamond spark
      const r = s.size * detailScale;
      ctx.beginPath();
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r * 0.65, y);
      ctx.lineTo(x, y + r);
      ctx.lineTo(x - r * 0.65, y);
      ctx.closePath();
      ctx.fill();
    } else if (s.type === 'cross') {
      // 4-pointed cross star flare
      const arm = s.size * 1.3 * detailScale;
      ctx.lineWidth = detailScale;
      ctx.beginPath();
      ctx.moveTo(x - arm, y);
      ctx.lineTo(x + arm, y);
      ctx.moveTo(x, y - arm);
      ctx.lineTo(x, y + arm);
      ctx.stroke();
      ctx.fillRect(x - 0.75 * detailScale, y - 0.75 * detailScale, 1.5 * detailScale, 1.5 * detailScale);
    } else {
      // Glowing dot
      ctx.beginPath();
      ctx.arc(x, y, s.size * 0.6 * detailScale, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawSpaceMote(ctx, m, x, y, detailScale) {
    ctx.fillStyle = m.color;
    ctx.shadowColor = m.color;
    ctx.shadowBlur = 10 * detailScale;
    ctx.beginPath();
    ctx.arc(x, y, m.size * detailScale, 0, Math.PI * 2);
    ctx.fill();
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
    const pixelScale = (this.canvas?.pixelRatio || 1) * (world.renderScale || 1);
    if (this.rangeFieldVisual) this.rangeFieldVisual.draw(ctx, this, trans.x, trans.y, attack.range, pixelScale);
    else this._drawRangeField(ctx, trans.x, trans.y, attack.range);

    // 2. Target lock-on brackets
    if (targetComp && targetComp.targetEntityId) {
      const enemyTrans = world.getComponent(targetComp.targetEntityId, TransformComponent);
      if (enemyTrans) {
        this._drawLockOnReticle(ctx, enemyTrans.x, enemyTrans.y);
      }
    }

    const health = world.getComponent(towerId, HealthComponent);
    if (this.towerVisual) this.towerVisual.draw(ctx, this, render, health, trans.x, trans.y, trans.rotation, pixelScale);
    else this._drawTowerBody(ctx, render, health, trans.x, trans.y, trans.rotation);
    ctx.restore();
  }

  _drawMenuCore(world) {
    const canvas = this.menuCanvas;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    // Hidden pages do not allocate or render another frame buffer.
    if (!width || !height) return;
    const ratio = Math.min(this.canvas.pixelRatio || 1, 1.5, 900 / Math.max(width, height));
    const bufferWidth = Math.round(width * ratio);
    const bufferHeight = Math.round(height * ratio);
    if (canvas.width !== bufferWidth) canvas.width = bufferWidth;
    if (canvas.height !== bufferHeight) canvas.height = bufferHeight;
    const ctx = this.menuCtx;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const towers = world.getEntitiesWith(TowerComponent, RenderComponent, HealthComponent);
    if (!towers.length) return;
    const towerId = towers[0];
    const render = world.getComponent(towerId, RenderComponent);
    const health = world.getComponent(towerId, HealthComponent);
    this.menuCoreVisual.draw(ctx, this, render, health, width, height, ratio);
  }

  _drawTowerBody(ctx, render, health, x, y, rotation) {
    ctx.save();
    ctx.translate(x, y);
    this._drawTowerChassis(ctx, render, health);
    this._drawReactorCore(ctx, render.radius);
    this._drawTowerBarrel(ctx, render, rotation);
    ctx.restore();
  }

  _drawTowerChassis(ctx, render, health) {
    ctx.save();
    ctx.shadowColor = render.glowColor;
    ctx.shadowBlur = render.glowBlur;
    // Outer octagonal armor
    ctx.fillStyle = '#0d1520';
    ctx.strokeStyle = render.color;
    ctx.lineWidth = 3;
    this._drawPolygonPath(ctx, 0, 0, render.radius, 8, Math.PI / 8);
    ctx.fill();
    ctx.stroke();

    // Health is inset into the armor and drawn before the gun, like the reactor.
    if (health) this._drawTowerHealthRing(ctx, render.radius, health);

    ctx.restore();
  }

  _drawTowerBarrel(ctx, render, rotation) {
    ctx.save();
    ctx.rotate(rotation);
    ctx.fillStyle = '#102233';
    ctx.strokeStyle = '#00f3ff';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#00f3ff';
    ctx.shadowBlur = 10;

    // Single centered railgun barrel
    const barrelLength = render.radius + GameConfig.tower.barrelExtension;
    const barrelWidth = GameConfig.tower.barrelWidth;
    const halfWidth = barrelWidth / 2;

    // Turret barrel mount / shroud
    ctx.fillStyle = '#0a1622';
    ctx.fillRect(4, -halfWidth - 2, 12, barrelWidth + 4);
    ctx.strokeRect(4, -halfWidth - 2, 12, barrelWidth + 4);

    // Main central barrel
    ctx.fillStyle = '#102233';
    ctx.fillRect(8, -halfWidth, barrelLength - 8, barrelWidth);
    ctx.strokeRect(8, -halfWidth, barrelLength - 8, barrelWidth);

    // Inner glowing rail energy core line along center
    ctx.strokeStyle = 'rgba(0, 243, 255, 0.7)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.lineTo(barrelLength - 2, 0);
    ctx.stroke();

    // Muzzle capacitor tip
    ctx.fillStyle = '#00f3ff';
    ctx.fillRect(barrelLength - 3, -halfWidth - 1, 5, barrelWidth + 2);

    ctx.restore();
  }

  _drawReactorCore(ctx, radius, pulse = 0.9 + Math.sin(this.corePulseAngle) * 0.1) {
    const socketRadius = radius * 0.48;
    const lensRadius = radius * 0.25;
    ctx.save();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#03131f';
    ctx.strokeStyle = '#286c7b';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, 0, socketRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Fixed segmented conductors make the reactor feel built into the chassis.
    ctx.strokeStyle = `rgba(81, 231, 235, ${0.65 * pulse})`;
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) {
      const start = i * Math.PI * 2 / 3 + 0.22;
      ctx.beginPath();
      ctx.arc(0, 0, socketRadius * 0.77, start, start + 1.35);
      ctx.stroke();
    }
    ctx.fillStyle = '#80d7df';
    for (let i = 0; i < 6; i++) {
      const angle = i * Math.PI / 3;
      ctx.beginPath();
      ctx.arc(Math.cos(angle) * socketRadius, Math.sin(angle) * socketRadius, 0.75, 0, Math.PI * 2);
      ctx.fill();
    }

    const lens = ctx.createRadialGradient(-lensRadius * 0.2, -lensRadius * 0.2, 0, 0, 0, lensRadius);
    lens.addColorStop(0, '#efffff');
    lens.addColorStop(0.25, '#a5ffff');
    lens.addColorStop(0.65, '#20d5df');
    lens.addColorStop(1, '#07526a');
    ctx.globalAlpha = pulse;
    ctx.shadowColor = '#2ae3ef';
    ctx.shadowBlur = 7;
    ctx.fillStyle = lens;
    ctx.beginPath();
    ctx.arc(0, 0, lensRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  _drawTowerHealthRing(ctx, radius, health, glow = true) {
    const ratio = getHealthRatio(health.current, health.max);
    const color = getHealthColor(ratio);
    const ringRadius = radius * 0.78;
    const segments = 24;
    const step = Math.PI * 2 / segments;
    const gap = 0.055;
    ctx.save();
    ctx.shadowBlur = 0;
    ctx.lineCap = 'butt';

    // Recessed channel and fine metal lips, entirely inside the armor silhouette.
    ctx.strokeStyle = '#030c14';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(0, 0, ringRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#385260';
    ctx.lineWidth = 0.65;
    for (const lip of [-3, 3]) {
      ctx.beginPath();
      ctx.arc(0, 0, ringRadius + lip, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Empty cells stay visible; the final lit cell drains continuously.
    ctx.lineWidth = 3;
    for (let i = 0; i < segments; i++) {
      const start = -Math.PI / 2 + i * step + gap / 2;
      const span = step - gap;
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#1c333d';
      ctx.beginPath();
      ctx.arc(0, 0, ringRadius, start, start + span);
      ctx.stroke();
      const filled = Math.max(0, Math.min(1, ratio * segments - i));
      if (filled === 0) continue;
      ctx.strokeStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = glow ? 3 : 0;
      ctx.beginPath();
      ctx.arc(0, 0, ringRadius, start, start + span * filled);
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawRangeField(ctx, cx, cy, range) {
    this._drawRangeBase(ctx, cx, cy, range);
    this._drawRangePerimeter(ctx, cx, cy, range, -this.radarRotation * 40);
    this._drawRangeAccent(ctx, cx, cy, range, this.radarRotation * 25);
    this._drawRangeTicks(ctx, cx, cy, range, this.radarRotation * 0.25);
  }

  _drawRangeBase(ctx, cx, cy, range) {
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

    ctx.restore();
  }

  _drawRangePerimeter(ctx, cx, cy, range, offset) {
    ctx.save();
    // 3. Animated outer perimeter (tech dashes)
    ctx.strokeStyle = '#00f3ff';
    ctx.shadowColor = '#00f3ff';
    ctx.shadowBlur = 14;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([16, 12, 6, 12]);
    ctx.lineDashOffset = offset;
    ctx.beginPath();
    ctx.arc(cx, cy, range, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }

  _drawRangeAccent(ctx, cx, cy, range, offset) {
    ctx.save();
    ctx.shadowColor = '#00f3ff';
    // Counter-rotating inner perimeter accent
    ctx.strokeStyle = 'rgba(0, 243, 255, 0.35)';
    ctx.shadowBlur = 6;
    ctx.lineWidth = 1;
    ctx.setLineDash([24, 24]);
    ctx.lineDashOffset = offset;
    ctx.beginPath();
    ctx.arc(cx, cy, range - 5, 0, Math.PI * 2);
    ctx.stroke();

    ctx.setLineDash([]);

    ctx.restore();
  }

  _drawRangeTicks(ctx, cx, cy, range, rotation) {
    ctx.save();
    ctx.setLineDash([]);
    // 4. Tactical radar crosshair ticks (8 compass points)
    ctx.strokeStyle = '#00f3ff';
    ctx.shadowColor = '#00f3ff';
    ctx.shadowBlur = 10;
    ctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      const angle = rotation + (i * Math.PI) / 4;
      const x1 = cx + (range - 8) * Math.cos(angle);
      const y1 = cy + (range - 8) * Math.sin(angle);
      const x2 = cx + (range + 8) * Math.cos(angle);
      const y2 = cy + (range + 8) * Math.sin(angle);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

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
    const pixelScale = (this.canvas.pixelRatio || 1) * (world.renderScale || 1);
    for (const id of enemies) {
      const enemy = world.getComponent(id, EnemyComponent);
      if (enemy.type !== 'aegis') continue;
      const health = world.getComponent(id, HealthComponent);
      if (health.current <= 0) continue;
      const trans = world.getComponent(id, TransformComponent);
      const radius = enemy.shieldDomeRadius || 115;
      const extent = radius * 1.08;
      // Skip fully offscreen fields, but retain domes whose edge is already visible.
      if (trans.x + extent < 0 || trans.y + extent < 0 ||
          trans.x - extent > world.width || trans.y - extent > world.height) continue;
      this.aegisShieldVisual.draw(ctx, trans.x, trans.y, radius, this.spaceTime, pixelScale, id * 1.618, trans.rotation);
    }
  }

  _drawEnemies(ctx, world) {
    const enemies = world.getEntitiesWith(EnemyComponent, TransformComponent, RenderComponent, HealthComponent);
    // Pre-filter the few active emitters once, rather than scan all enemies for every body.
    const fields = [];
    for (const id of world.getEntitiesWith(EnemyComponent, TransformComponent, HealthComponent)) {
      const enemy = world.getComponent(id, EnemyComponent);
      if (enemy.type !== 'aegis' || world.getComponent(id, HealthComponent).current <= 0) continue;
      const position = world.getComponent(id, TransformComponent);
      fields.push({ x: position.x, y: position.y, radius: enemy.shieldDomeRadius || 115 });
    }

    for (const id of enemies) {
      const trans = world.getComponent(id, TransformComponent);
      const render = world.getComponent(id, RenderComponent);
      const health = world.getComponent(id, HealthComponent);
      const enemy = world.getComponent(id, EnemyComponent);
      const extent = render.radius * 1.5 + render.glowBlur * 3 + 20;
      if (trans.x + extent < 0 || trans.y + extent < 0 || trans.x - extent > world.width || trans.y - extent > world.height) continue;
      const cover = getAegisCoverStrength(trans.x, trans.y, fields);
      const glowScale = 1 - (1 - AEGIS_SHIELD_ATTENUATION.glow) * cover;

      ctx.save();
      ctx.translate(trans.x, trans.y);
      ctx.rotate(trans.rotation);
      ctx.globalAlpha *= 1 - (1 - AEGIS_SHIELD_ATTENUATION.opacity) * cover;

      const pixelScale = (this.canvas?.pixelRatio || 1) * (world.renderScale || 1);
      const carrier = world.getComponent(id, CarrierComponent);
      const siege = world.getComponent(id, ArchitectSiegeComponent);
      const rail = world.getComponent(id,RailgunComponent);
      const phase = rail ? (rail.phase==='approach'||rail.phase==='reposition'?'idle':rail.phase) : siege ? (siege.phase === 'approach' ? 'armored' : siege.phase)
        : carrier ? (carrier.phase === 'exposed' ? 'exposed' : carrier.phase === 'launch' ? 'launch' : 'closed') : '';
      const armorOpen = siege ? getArchitectArmorOpen(siege, GameConfig.enemies.boss_architect) : undefined;
      if (this.enemyVisualCache) this.enemyVisualCache.draw(ctx, this, enemy.type, render, glowScale, pixelScale, phase, armorOpen);
      else this._drawEnemyBody(ctx, enemy.type, render, glowScale, true, phase, armorOpen);

      ctx.restore();

      if (enemy.type === 'boss_architect' || enemy.type === 'boss_carrier' || enemy.type === 'boss_scout' || enemy.type === 'boss_railgun') {
        ctx.save(); ctx.translate(trans.x, trans.y); ctx.rotate(trans.rotation);
        this._drawBossHullHealth(ctx, enemy.type, render, health, armorOpen || 0); ctx.restore();
      } else if (health.current < health.max) {
        this._drawHealthBar(ctx, trans.x, trans.y - render.radius - 8, render.radius * 2, health.current, health.max);
      }
    }
  }

  _drawRailgunBeams(ctx,world) {
    if(!this.railgunBeamVisual || world.inMenu || world.isGameOver) return;
    const tower=world.getEntitiesWith(TowerComponent,TransformComponent,CircleColliderComponent,HealthComponent)[0];
    if(tower===undefined || world.getComponent(tower,HealthComponent).current<=0) return;
    const target=world.getComponent(tower,TransformComponent), towerRadius=world.getComponent(tower,CircleColliderComponent).radius;
    for(const id of world.getEntitiesWith(RailgunComponent,TransformComponent,HealthComponent,EnemyComponent)) {
      const rail=world.getComponent(id,RailgunComponent), enemy=world.getComponent(id,EnemyComponent);
      if(world.getComponent(id,HealthComponent).current<=0 || enemy.knockbackRemaining>0 || (rail.phase!=='charge'&&rail.phase!=='firing')) continue;
      const source=world.getComponent(id,TransformComponent), cfg=GameConfig.enemies.boss_railgun;
      const angle=Math.atan2(target.y-source.y,target.x-source.x), muzzle=cfg.radius*.88;
      const progress=rail.phase==='charge'?1-rail.phaseRemaining/cfg.chargeDuration:rail.phaseRemaining/cfg.beamDuration;
      this.railgunBeamVisual.draw(ctx,source.x+Math.cos(angle)*muzzle,source.y+Math.sin(angle)*muzzle,angle,
        Math.hypot(target.x-source.x,target.y-source.y)-muzzle-towerRadius,rail.phase,Math.max(0,Math.min(1,progress)));
    }
  }

  _drawArchitectDrills(ctx, world) {
    if (!this.architectDrillVisual || world.inMenu || world.isGameOver) return;
    const bosses = world.getEntitiesWith(ArchitectDrillComponent, TransformComponent, CircleColliderComponent, HealthComponent);
    if (!bosses.length) return;
    const tower = world.getEntitiesWith(TowerComponent, TransformComponent, CircleColliderComponent, HealthComponent)[0];
    if (tower === undefined || world.getComponent(tower, HealthComponent).current <= 0) return;
    const target = world.getComponent(tower, TransformComponent), targetRadius = world.getComponent(tower, CircleColliderComponent).radius;
    for (const id of bosses) {
      const drill = world.getComponent(id, ArchitectDrillComponent);
      if (!drill.active || !drill.aimReady || world.getComponent(id, HealthComponent).current <= 0) continue;
      const source = world.getComponent(id, TransformComponent), radius = world.getComponent(id, CircleColliderComponent).radius;
      const dx = target.x - source.x, dy = target.y - source.y, distance = Math.hypot(dx, dy);
      if (!distance || distance > radius + targetRadius + GameConfig.enemies.boss_architect.drillGap + .5) continue;
      const nx = dx / distance, ny = dy / distance;
      // The tower faces a plate joint (local diagonal). Its two neighboring
      // broad-face recesses are at (±.82r, 0) / (0, ±.82r). Place each source
      // just inside its recess, using a ±45° offset from the firing bearing.
      const muzzle = radius * .8 / Math.SQRT2;
      const flank = targetRadius * .8;
      const forward = Math.sqrt(targetRadius * targetRadius - flank * flank);
      for (const side of [-1, 1]) {
        const x = source.x + nx * muzzle - ny * muzzle * side;
        const y = source.y + ny * muzzle + nx * muzzle * side;
        const endX = target.x - nx * forward - ny * flank * side;
        const endY = target.y - ny * forward + nx * flank * side;
        this.architectDrillVisual.draw(ctx, x, y, Math.atan2(endY - y, endX - x),
          Math.hypot(endX - x, endY - y), drill.elapsed);
      }
    }
  }

  _drawEnemyBody(ctx, type, render, glowScale = 1, includeBossCore = true, variant = '', armorOpen) {
      ctx.shadowColor = render.glowColor;
      ctx.shadowBlur = render.glowBlur * glowScale;
      ctx.fillStyle = '#0a0d14';
      ctx.strokeStyle = render.color;
      ctx.lineWidth = 2.5;

      if (type === 'boss_scout') {
        drawScoutBossBody(ctx, render, glowScale);
      } else if (type === 'boss_railgun') {
        drawRailgunBody(ctx,render,glowScale,variant);
      } else if (type === 'boss_carrier') {
        drawCarrierBody(ctx, render, glowScale, variant);
      } else if (type === 'fighter') {
        // Fighter: aerodynamic dart shape
        this._drawDartPath(ctx, render.radius);
        ctx.fill();
        ctx.stroke();
      } else if (type === 'aegis') {
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
      } else if (type === 'splitter') {
        // Splitter: green triangular fractal
        this._drawSierpinskiTriangle(ctx, render.radius);
      } else if (type === 'splitter_shard') {
        // Splitter Shard: mini green triangle
        this._drawPolygonPath(ctx, 0, 0, render.radius, 3, -Math.PI / 2);
        ctx.fill();
        ctx.stroke();
      } else if (type === 'blinker') {
        // Blinker: white/cyan lightning zigzag vector
        this._drawLightningBolt(ctx, render.radius);
        ctx.fill();
        ctx.stroke();
      } else if (type === 'boss_architect') {
        drawArchitectBody(ctx, render, glowScale, variant, armorOpen);
        if (includeBossCore) this._drawBossCore(ctx, render.radius * 9 / 44, glowScale, variant);
      } else if (type === 'boss_shield') {
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
        if (type === 'tank') {
          this._drawPolygonPath(ctx, 0, 0, render.radius * 0.55, 6, Math.PI / 6);
          ctx.stroke();
        } else if (type === 'sniper') {
          // Sniper charging optic core
          ctx.fillStyle = render.color;
          ctx.beginPath();
          ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
          ctx.fill();
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

  _drawBossCore(ctx, radius, glowScale = 1, phase = '') {
    drawArchitectCore(ctx, radius, glowScale, phase);
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

  _drawBossHullHealth(ctx, type, render, health, armorOpen) {
    drawBossHullHealth(ctx, type, render, health, armorOpen);
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
      const extent = render.radius + render.glowBlur * 3 + 12;
      if (trans.x + extent < 0 || trans.y + extent < 0 || trans.x - extent > world.width || trans.y - extent > world.height) continue;

      ctx.save();
      ctx.translate(trans.x, trans.y);
      ctx.rotate(trans.rotation);

      if (this.projectileVisualCache) this.projectileVisualCache.draw(ctx, render, proj,
        (this.canvas?.pixelRatio || 1) * (world.renderScale || 1));
      else {
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

      // Soft ambient glow via larger semi-transparent quad (no costly shadowBlur filter)
      ctx.globalAlpha = alpha * 0.35;
      ctx.fillStyle = p.color;
      const glowSize = p.size * 2;
      ctx.fillRect(-glowSize / 2, -glowSize / 2, glowSize, glowSize);

      // Core crisp particle
      ctx.globalAlpha = alpha;
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
      const text = ft.upgradeName ? t('БЕСПЛАТНО: {name} +1', { name: t(ft.upgradeName) }) : ft.text;
      const alpha = Math.max(0, Math.min(1, ft.life / ft.maxLife));
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = `400 ${ft.fontSize}px 'WDXL Lubrifont SC', 'Segoe UI', sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const hasChip = ft.icon === 'microchip';
      const iconSize = ft.fontSize + 2;
      const iconGap = 5;
      const textX = hasChip ? ft.x - (iconSize + iconGap) / 2 : ft.x;

      // 1. High-contrast dark outline so text pops on any background
      ctx.lineWidth = ft.isCrit ? 4 : 3;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.95)';
      ctx.shadowBlur = 0; // clear shadow for crisp border
      ctx.strokeText(text, textX, ft.y);

      // 2. Bright glowing fill (shadowBlur enabled only for crits)
      ctx.fillStyle = ft.color;
      if (ft.isCrit) {
        ctx.shadowColor = ft.color;
        ctx.shadowBlur = 16;
      } else {
        ctx.shadowBlur = 0;
      }
      ctx.fillText(text, textX, ft.y);
      if (hasChip) {
        const iconX = textX + ctx.measureText(text).width / 2 + iconGap;
        ctx.drawImage(this._getMicrochipSprite(), iconX, ft.y - iconSize / 2, iconSize, iconSize);
      }

      ctx.restore();
    }
  }

  _getMicrochipSprite() {
    if (this._microchipSprite) return this._microchipSprite;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.scale(64 / 24, 64 / 24);
    // Same processor silhouette as the wallet icon; rasterized once, without live glow.
    const path = new Path2D('M7 5H17A2 2 0 0 1 19 7V17A2 2 0 0 1 17 19H7A2 2 0 0 1 5 17V7A2 2 0 0 1 7 5Z M10 9H14A1 1 0 0 1 15 10V14A1 1 0 0 1 14 15H10A1 1 0 0 1 9 14V10A1 1 0 0 1 10 9Z M8 2V5M12 2V5M16 2V5M8 19V22M12 19V22M16 19V22M2 8H5M2 12H5M2 16H5M19 8H22M19 12H22M19 16H22');
    ctx.lineCap = ctx.lineJoin = 'round';
    ctx.strokeStyle = '#050811'; ctx.lineWidth = 3.2; ctx.stroke(path);
    ctx.strokeStyle = '#9cd5ff'; ctx.lineWidth = 1.6; ctx.stroke(path);
    this._microchipSprite = canvas;
    return canvas;
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
