/**
 * ParticleSystem.js
 * Manages geometric neon debris, shockwave rings, and floating combat text.
 */

import { TransformComponent } from '../components/TransformComponent.js';

const REWARD_FLOAT_SPEED = 60;

export class ParticleSystem {
  constructor() {
    this.particles = [];
    this.shockwaves = [];
    this.floatingTexts = [];
    this.isParticleSystem = true;
  }

  reset() {
    this.particles = [];
    this.shockwaves = [];
    this.floatingTexts = [];
  }


  init(world) {
    world.eventBus.on('RUN_CRYSTALS_CHANGED', event => {
      if (event.source !== 'kill' || !Number.isFinite(event.x) || !Number.isFinite(event.y)) return;
      // A separate row with the same velocity keeps both rewards apart throughout their flight.
      this.floatingTexts.push({ x: event.x, y: event.y - 48, text: `+${event.earned}`, icon: 'microchip',
        color: '#9cd5ff', fontSize: 18, isCrit: false, vy: REWARD_FLOAT_SPEED, life: 1.3, maxLife: 1.3 });
    });
    // 1. Damage dealt: hit sparks only (no screen-cluttering damage numbers)
    world.eventBus.on('DAMAGE_DEALT', (event) => {
      if (event.isContinuous) return; // Drill impact is rendered by its bounded visual cache.
      this._spawnDamageSparks(event.x, event.y, event.isCrit ? '#ffe600' : '#00f3ff', event.isCrit ? 10 : 5);
    });

    // 2. Kill bounty: clean and rewarding floating currency text (+X ◈)
    world.eventBus.on('CREDITS_CHANGED', (event) => {
      if (event.source === 'kill' && event.earned > 0 && event.x !== undefined && event.y !== undefined) {
        this.floatingTexts.push({
          x: event.x + (Math.random() * 10 - 5),
          y: event.y - 12,
          text: `+${event.earned} ◈`,
          color: '#f0db96', // Same gold as the credit wallet and upgrade prices.
          fontSize: event.earned >= 30 ? 22 : 18,
          isCrit: event.earned >= 30, // Extra glow for high-value targets like tanks
          vy: REWARD_FLOAT_SPEED,
          life: 1.0,
          maxLife: 1.0
        });
      }
    });

    // 2. Entity explosion: bursting shards + expanding shockwave
    world.eventBus.on('ENTITY_DIED', (event) => {
      const colorMap = {
        scout: '#ffe600',
        fighter: '#ff0055',
        tank: '#9d00ff',
        sniper: '#ff7700',
        aegis: '#00e5ff',
        splitter: '#00ff66',
        splitter_shard: '#00ff66',
        blinker: '#ffffff',
        boss_architect: '#ff7189',
        boss_railgun: '#ff9e50',
        boss_shield: '#00f3ff'
      };
      const color = colorMap[event.enemyType] || '#00f3ff';
      const isBoss = event.enemyType === 'boss_architect' || event.enemyType === 'boss_railgun';

      // Burst of fragments
      const particleCount = isBoss ? 45 : (event.enemyType === 'tank' || event.enemyType === 'splitter' ? 24 : 14);
      this._spawnExplosion(event.x, event.y, color, particleCount);

      // Expanding neon shockwave
      this.shockwaves.push({
        x: event.x,
        y: event.y,
        radius: 6,
        maxRadius: isBoss ? 90 : (event.enemyType === 'tank' ? 55 : 35),
        color,
        lineWidth: isBoss ? 5 : 3,
        life: isBoss ? 0.75 : 0.45,
        maxLife: isBoss ? 0.75 : 0.45
      });
    });

    // 3. Sniper muzzle flare or shot effect
    world.eventBus.on('ENEMY_SNIPER_SHOT', (event) => {
      this._spawnDamageSparks(event.x, event.y, '#ff7700', 6);
    });

    // 4. Blinker teleport dash: electric lightning trail + dual shockwaves
    world.eventBus.on('BLINKER_DASH', (event) => {
      this._spawnBlinkerDashTrail(event.fromX, event.fromY, event.toX, event.toY);
    });
    world.eventBus.on('PROJECTILE_RICOCHET', event => this._spawnDamageSparks(event.x, event.y, '#b7a3ef', 3));
    world.eventBus.on('RAPID_FIRE_STARTED', event => {
      this._spawnDamageSparks(event.x, event.y, '#ff9cec', 8);
    });
    world.eventBus.on('FREE_UPGRADES_GRANTED', event => {
      const position = world.getComponent(event.towerId, TransformComponent);
      if (!position) return;
      event.granted.forEach((grant, index) => {
        this.floatingTexts.push({ x: position.x, y: position.y - 50 - index * 22,
          text: `БЕСПЛАТНО: ${grant.name} +1`, upgradeName: grant.name, color: '#9ee9bf', fontSize: 15, isCrit: false,
          vy: 12, life: 3, maxLife: 3 });
      });
    });
  }

  update(world, deltaTime) {
    // 1. Update particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * deltaTime;
      p.y += p.vy * deltaTime;
      p.vx *= 0.94; // friction
      p.vy *= 0.94;
      p.rotation += p.vRot * deltaTime;
      p.life -= deltaTime;

      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }

    // 2. Update shockwaves
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i];
      sw.life -= deltaTime;
      const progress = 1 - (sw.life / sw.maxLife);
      sw.radius = 6 + (sw.maxRadius - 6) * progress;

      if (sw.life <= 0) {
        this.shockwaves.splice(i, 1);
      }
    }

    // 3. Update floating texts
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.y -= ft.vy * deltaTime;
      ft.vy *= 0.96;
      ft.life -= deltaTime;

      if (ft.life <= 0) {
        this.floatingTexts.splice(i, 1);
      }
    }
  }

  _spawnDamageSparks(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 70 + Math.random() * 120;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        rotation: Math.random() * Math.PI * 2,
        vRot: (Math.random() - 0.5) * 10,
        size: 2.5 + Math.random() * 2,
        color,
        life: 0.35 + Math.random() * 0.2,
        maxLife: 0.55
      });
    }
  }

  _spawnExplosion(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 100 + Math.random() * 220;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        rotation: Math.random() * Math.PI * 2,
        vRot: (Math.random() - 0.5) * 15,
        size: 3 + Math.random() * 4,
        color,
        life: 0.45 + Math.random() * 0.35,
        maxLife: 0.8
      });
    }
  }

  _spawnBlinkerDashTrail(fromX, fromY, toX, toY) {
    // 1. Expanding shockwave ring at dash origin
    this.shockwaves.push({
      x: fromX,
      y: fromY,
      radius: 4,
      maxRadius: 28,
      color: '#00f3ff',
      lineWidth: 2.5,
      life: 0.35,
      maxLife: 0.35
    });

    // 2. Expanding shockwave ring at dash destination
    this.shockwaves.push({
      x: toX,
      y: toY,
      radius: 4,
      maxRadius: 24,
      color: '#ffffff',
      lineWidth: 2.5,
      life: 0.35,
      maxLife: 0.35
    });

    // 3. Lightning electric spark trail along the teleport vector
    const dx = toX - fromX;
    const dy = toY - fromY;
    const steps = 12;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const px = fromX + dx * t + (Math.random() - 0.5) * 10;
      const py = fromY + dy * t + (Math.random() - 0.5) * 10;
      this.particles.push({
        x: px,
        y: py,
        vx: (Math.random() - 0.5) * 40,
        vy: (Math.random() - 0.5) * 40,
        rotation: Math.random() * Math.PI * 2,
        vRot: (Math.random() - 0.5) * 12,
        size: 2.2 + Math.random() * 2.0,
        color: Math.random() < 0.55 ? '#ffffff' : '#00f3ff',
        life: 0.25 + Math.random() * 0.15,
        maxLife: 0.4
      });
    }
  }

  rescale(scaleX, scaleY) {
    for (const p of this.particles) {
      p.x *= scaleX;
      p.y *= scaleY;
      p.vx *= scaleX;
      p.vy *= scaleY;
    }
    const uniformScale = (scaleX + scaleY) * 0.5;
    for (const s of this.shockwaves) {
      s.x *= scaleX;
      s.y *= scaleY;
      s.radius *= uniformScale;
      s.maxRadius *= uniformScale;
    }
    for (const ft of this.floatingTexts) {
      ft.x *= scaleX;
      ft.y *= scaleY;
    }
  }

  getParticles() {
    return this.particles;
  }

  getShockwaves() {
    return this.shockwaves;
  }

  getFloatingTexts() {
    return this.floatingTexts;
  }
}
