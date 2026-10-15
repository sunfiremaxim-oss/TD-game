/**
 * WaveSystem.js
 * Manages wave scheduling, onboarding pacing curves, micro-jitter speed variance,
 * 5-second intermission break countdowns, and mathematical stat scaling.
 */

import { TransformComponent } from '../components/TransformComponent.js';
import { VelocityComponent } from '../components/VelocityComponent.js';
import { CircleColliderComponent } from '../components/CircleColliderComponent.js';
import { HealthComponent } from '../components/HealthComponent.js';
import { ArmorComponent } from '../components/ArmorComponent.js';
import { RenderComponent } from '../components/RenderComponent.js';
import { EnemyComponent } from '../components/EnemyComponent.js';
import { TowerComponent } from '../components/TowerComponent.js';
import { AttackComponent } from '../components/AttackComponent.js';
import { GameConfig } from '../config/GameConfig.js';

export class WaveSystem {
  constructor() {
    this.currentWave = 1;
    this.state = 'ACTIVE'; // Wave 1 starts immediately
    this.intermissionTimer = 0;
    this.intermissionDuration = GameConfig.waves.intermissionDuration || 5.0;

    this.spawnQueue = [];
    this.spawnInterval = 1.2;
    this.spawnTimer = 0.3; // First enemy spawns in 0.3s
    this.totalEnemiesInWave = 0;
    this.enemiesSpawned = 0;
  }

  init(world) {
    world.eventBus.on('SPLITTER_SPLIT', (event) => {
      this._spawnSplitterShards(world, event.x, event.y);
    });
  }

  startFirstWave(world) {
    this.currentWave = 1;
    this._startWave(world);
  }

  update(world, deltaTime) {
    if (world.isGameOver) return;

    if (this.state === 'INTERMISSION') {
      this.intermissionTimer -= deltaTime;

      world.eventBus.emit('INTERMISSION_TICK', {
        remaining: Math.max(0, this.intermissionTimer),
        duration: this.intermissionDuration,
        progress: Math.max(0, this.intermissionTimer) / this.intermissionDuration,
        nextWave: this.currentWave
      });

      if (this.intermissionTimer <= 0) {
        this._startWave(world);
      }
    } else if (this.state === 'ACTIVE') {
      // 1. Spawning
      this.spawnTimer -= deltaTime;
      if (this.spawnTimer <= 0 && this.spawnQueue.length > 0) {
        const nextType = this.spawnQueue.shift();
        this._spawnEnemy(world, nextType);
        this.enemiesSpawned++;
        this.spawnTimer = this.spawnInterval;

        world.eventBus.emit('WAVE_PROGRESS', {
          wave: this.currentWave,
          spawned: this.enemiesSpawned,
          total: this.totalEnemiesInWave,
          alive: world.getEntitiesWith(EnemyComponent).length
        });
      }

      // 2. Wave Completion Check
      const activeEnemies = world.getEntitiesWith(EnemyComponent);
      if (this.spawnQueue.length === 0 && activeEnemies.length === 0) {
        this._completeWave(world);
      }
    }
  }

  _startWave(world) {
    this.state = 'ACTIVE';
    this.spawnQueue = this._generateWaveEnemies(this.currentWave);
    this.totalEnemiesInWave = this.spawnQueue.length;
    this.enemiesSpawned = 0;
    this.spawnInterval = this._calculateSpawnInterval(this.currentWave);
    this.spawnTimer = 0.5; // Short delay before first spawn

    world.eventBus.emit('WAVE_STARTED', {
      wave: this.currentWave,
      totalEnemies: this.totalEnemiesInWave
    });
  }

  _completeWave(world) {
    world.eventBus.emit('WAVE_COMPLETED', {
      wave: this.currentWave
    });

    this.currentWave++;
    this.state = 'INTERMISSION';
    this.intermissionDuration = GameConfig.waves.intermissionDuration || 5.0; // 5-second break phase
    this.intermissionTimer = this.intermissionDuration;

    world.eventBus.emit('INTERMISSION_STARTED', {
      duration: this.intermissionDuration,
      nextWave: this.currentWave
    });
  }

  /**
   * Generates enemy sequence matching onboarding curve and high-wave scaling
   */
  _generateWaveEnemies(wave) {
    const list = [];

    // Boss Waves: Every 10th wave (10, 20, 30...) features the Architect Boss
    if (wave % 10 === 0) {
      list.push('boss_architect');
      return list;
    }

    if (wave === 1) {
      // Wave 1: 9 basic scouts
      for (let i = 0; i < 9; i++) list.push('scout');
    } else if (wave === 2) {
      // Wave 2: 12 scouts
      for (let i = 0; i < 12; i++) list.push('scout');
    } else if (wave === 3) {
      // Wave 3: 16 scouts
      for (let i = 0; i < 16; i++) list.push('scout');
    } else if (wave === 4) {
      // Wave 4: First Fighters (speed test) + scouts
      for (let i = 0; i < 10; i++) list.push('scout');
      for (let i = 0; i < 6; i++) list.push('fighter');
    } else if (wave === 5) {
      // Wave 5: Debut of Pentagon Aegis (exactly 1 unit) + scouts & fighters
      for (let i = 0; i < 10; i++) list.push('scout');
      for (let i = 0; i < 6; i++) list.push('fighter');
      list.push('aegis'); // Exactly 1 on Wave 5
    } else if (wave === 6) {
      // Wave 6: Debut of Fractal Splitter (1 unit) + Tanks
      for (let i = 0; i < 10; i++) list.push('scout');
      for (let i = 0; i < 5; i++) list.push('fighter');
      for (let i = 0; i < 2; i++) list.push('tank');
      list.push('aegis');
      list.push('splitter');
    } else if (wave === 7) {
      // Wave 7: Debut of Vector Blinker (1 unit)
      for (let i = 0; i < 10; i++) list.push('scout');
      for (let i = 0; i < 5; i++) list.push('fighter');
      for (let i = 0; i < 3; i++) list.push('tank');
      list.push('aegis');
      list.push('splitter');
      list.push('blinker');
    } else if (wave === 8) {
      // Wave 8: Debut of Snipers + combined roster
      for (let i = 0; i < 9; i++) list.push('scout');
      for (let i = 0; i < 5; i++) list.push('fighter');
      for (let i = 0; i < 3; i++) list.push('tank');
      for (let i = 0; i < 3; i++) list.push('sniper');
      list.push('aegis');
      list.push('splitter');
      list.push('blinker');
    } else if (wave === 9) {
      // Wave 9: Intense combined pre-boss wave
      for (let i = 0; i < 10; i++) list.push('scout');
      for (let i = 0; i < 6; i++) list.push('fighter');
      for (let i = 0; i < 3; i++) list.push('tank');
      for (let i = 0; i < 3; i++) list.push('sniper');
      list.push('aegis');
      list.push('splitter');
      list.push('blinker');
      list.push('blinker');
    } else {
      // Wave 11+: High wave scaling with calibrated special enemy counts
      const baseCount = 20 + (wave - 10) * 3;

      // Aegis: 1 on w5, 2-3 on w15, max 4
      const aegisCount = Math.min(4, Math.max(1, Math.floor(1 + (wave - 5) / 5)));
      // Splitter: rare unique unit, 1-3
      const splitterCount = Math.min(3, Math.max(1, Math.floor(1 + (wave - 6) / 6)));
      // Blinker: 2-4
      const blinkerCount = Math.min(4, Math.max(1, Math.floor(1 + (wave - 7) / 4)));

      for (let i = 0; i < aegisCount; i++) list.push('aegis');
      for (let i = 0; i < splitterCount; i++) list.push('splitter');
      for (let i = 0; i < blinkerCount; i++) list.push('blinker');

      const regularCount = Math.max(12, baseCount - aegisCount - splitterCount - blinkerCount);
      const scoutCount = Math.floor(regularCount * 0.35);
      const fighterCount = Math.floor(regularCount * 0.25);
      const tankCount = Math.floor(regularCount * 0.22);
      const sniperCount = Math.max(1, regularCount - scoutCount - fighterCount - tankCount);

      for (let i = 0; i < scoutCount; i++) list.push('scout');
      for (let i = 0; i < fighterCount; i++) list.push('fighter');
      for (let i = 0; i < tankCount; i++) list.push('tank');
      for (let i = 0; i < sniperCount; i++) list.push('sniper');
    }

    // Shuffle queue slightly so enemy types interleave smoothly
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }

    return list;
  }

  _calculateSpawnInterval(wave) {
    if (wave === 1) return 1.35; // Low density for early onboarding
    if (wave <= 3) return 1.05;
    if (wave <= 6) return 0.85;
    return Math.max(0.45, 0.80 - (wave - 6) * 0.03);
  }

  _spawnEnemy(world, type) {
    const archetype = GameConfig.enemies[type];
    if (!archetype) return;

    const enemyId = world.createEntity();
    const w = world.width || 1200;
    const h = world.height || 800;
    const centerX = w / 2;
    const centerY = h / 2;

    // Radial spawn: spawn at a uniform distance outside the visible screen corners
    // Guarantees all enemies travel identical distance to the tower core from any direction (fixes 16:9 pacing imbalance)
    const cornerDist = Math.hypot(w / 2, h / 2);
    const spawnMargin = 40;
    const spawnRadius = cornerDist + spawnMargin;

    const spawnAngle = Math.random() * Math.PI * 2;
    const spawnX = centerX + Math.cos(spawnAngle) * spawnRadius;
    const spawnY = centerY + Math.sin(spawnAngle) * spawnRadius;

    // 1. Micro-jitter speed variation (±5% to ±8%)
    const jitterMin = GameConfig.waves.speedJitterMin || -0.07;
    const jitterMax = GameConfig.waves.speedJitterMax || 0.07;
    const jitter = 1 + (jitterMin + Math.random() * (jitterMax - jitterMin));
    const finalSpeed = archetype.baseSpeed * jitter;

    // 2. Exponential stat scaling for higher waves
    // HP = BaseHP * (1.10 ^ (Wave - 1))
    // Damage = BaseDmg * (1.07 ^ (Wave - 1))
    const wave = this.currentWave;
    const hpMultiplier = Math.pow(GameConfig.waves.hpScaleFactor, wave - 1);
    const scaledHp = Math.round(archetype.baseHp * hpMultiplier);

    const dmgMultiplier = Math.pow(GameConfig.waves.damageScaleFactor, wave - 1);
    const scaledDamage = Math.max(1, Math.round(archetype.baseDamage * dmgMultiplier));

    const isSniper = archetype.type === 'sniper';

    // Sniper stop distance dynamically adapts to tower attack range
    // Ensures snipers always stop within player attack zone (e.g. 90% of range, max 240px)
    let stopDistance = archetype.stopDistance || 240;
    if (isSniper) {
      const towers = world.getEntitiesWith(TowerComponent, AttackComponent);
      const towerAttack = towers.length > 0 ? world.getComponent(towers[0], AttackComponent) : null;
      const currentTowerRange = towerAttack ? towerAttack.range : GameConfig.tower.baseRange;
      stopDistance = Math.min(archetype.stopDistance || 240, Math.floor(currentTowerRange * 0.90));
    }

    // Rotation: scout, tank, aegis, boss rotate smoothly; fighter, sniper, splitter, blinker point forward
    let rotSpeed = 0;
    if (archetype.type === 'scout') {
      rotSpeed = (Math.random() < 0.5 ? -1 : 1) * (1.2 + Math.random() * 1.6); // 1.2 to 2.8 rad/s
    } else if (archetype.type === 'tank') {
      rotSpeed = (Math.random() < 0.5 ? -1 : 1) * (0.4 + Math.random() * 0.6); // 0.4 to 1.0 rad/s
    } else if (archetype.type === 'aegis') {
      rotSpeed = (Math.random() < 0.5 ? -1 : 1) * 0.5;
    } else if (archetype.type === 'boss_architect') {
      rotSpeed = (Math.random() < 0.5 ? -1 : 1) * 0.4;
    }

    const angleToCenter = Math.atan2(centerY - spawnY, centerX - spawnX);
    const initialRotation = (archetype.type === 'scout' || archetype.type === 'tank' || archetype.type === 'aegis' || archetype.type === 'boss_architect')
      ? Math.random() * Math.PI * 2
      : angleToCenter;

    world.addComponent(enemyId, new TransformComponent(spawnX, spawnY, initialRotation));
    world.addComponent(enemyId, new VelocityComponent(0, 0, archetype.baseSpeed, finalSpeed));
    world.addComponent(enemyId, new CircleColliderComponent(archetype.radius, archetype.mass, false));
    world.addComponent(enemyId, new HealthComponent(scaledHp, scaledHp, 0));
    world.addComponent(enemyId, new ArmorComponent(0, 0));
    world.addComponent(enemyId, new RenderComponent(
      'polygon',
      archetype.sides,
      archetype.radius,
      archetype.color,
      archetype.glowColor,
      archetype.glowBlur
    ));

    const enemyComp = new EnemyComponent(
      archetype.type,
      archetype.baseReward,
      isSniper,
      isSniper ? (GameConfig.enemies.sniper.initialAimDelay || 0.45) : 0, // initial shootCooldown
      archetype.shootInterval || 2.8,
      stopDistance,
      rotSpeed,
      scaledDamage,
      1.0,
      archetype.shieldDomeRadius || 0
    );

    // If Boss Architect: spawn physical rotating shield segments
    if (archetype.type === 'boss_architect') {
      const shieldCount = wave >= 20 ? 8 : (archetype.shieldCount || 6);
      const orbitR = archetype.shieldOrbitRadius || 78;
      const orbitSpeed = archetype.shieldOrbitSpeed || 1.25;
      const shieldArchetype = GameConfig.enemies.boss_shield;
      const shieldHp = Math.round(shieldArchetype.baseHp * hpMultiplier);

      const shieldIds = [];
      for (let i = 0; i < shieldCount; i++) {
        const shieldAngle = (i / shieldCount) * Math.PI * 2;
        const sx = spawnX + Math.cos(shieldAngle) * orbitR;
        const sy = spawnY + Math.sin(shieldAngle) * orbitR;

        const sId = world.createEntity();
        world.addComponent(sId, new TransformComponent(sx, sy, shieldAngle + Math.PI / 2));
        world.addComponent(sId, new VelocityComponent(0, 0, 0, 0));
        world.addComponent(sId, new CircleColliderComponent(shieldArchetype.radius, shieldArchetype.mass, true)); // isStatic: true
        world.addComponent(sId, new HealthComponent(shieldHp, shieldHp, 0));
        world.addComponent(sId, new ArmorComponent(0, 0));
        world.addComponent(sId, new RenderComponent(
          'shield_segment',
          shieldArchetype.sides,
          shieldArchetype.radius,
          shieldArchetype.color,
          shieldArchetype.glowColor,
          shieldArchetype.glowBlur
        ));
        world.addComponent(sId, new EnemyComponent(
          'boss_shield',
          shieldArchetype.baseReward,
          false,
          0,
          0,
          0,
          0,
          shieldArchetype.baseDamage
        ));
        shieldIds.push(sId);
      }

      enemyComp.shieldCount = shieldCount;
      enemyComp.shieldIds = shieldIds;
      enemyComp.shieldOrbitRadius = orbitR;
      enemyComp.shieldOrbitSpeed = orbitSpeed;
      enemyComp.shieldOrbitAngle = 0;
    }

    world.addComponent(enemyId, enemyComp);

    world.eventBus.emit('ENEMY_SPAWNED', {
      entityId: enemyId,
      type: archetype.type,
      hp: scaledHp,
      damage: scaledDamage
    });
  }

  _spawnSplitterShards(world, x, y) {
    const archetype = GameConfig.enemies.splitter_shard;
    if (!archetype) return;

    const hpMultiplier = Math.pow(GameConfig.waves.hpScaleFactor, this.currentWave - 1);
    const scaledHp = Math.round(archetype.baseHp * hpMultiplier);
    const dmgMultiplier = Math.pow(GameConfig.waves.damageScaleFactor, this.currentWave - 1);
    const scaledDamage = Math.max(1, Math.round(archetype.baseDamage * dmgMultiplier));

    const towerX = world.width / 2;
    const towerY = world.height / 2;
    const angleToTower = Math.atan2(towerY - y, towerX - x);

    // Backward angle away from tower
    const angleAway = angleToTower + Math.PI;

    // 3 shards scatter backwards and to the sides: left-back, direct-back, right-back
    const scatterOffsets = [-0.75, 0, 0.75];
    const burstSpeed = 220;
    const scatterDuration = 0.50; // 0.5 seconds of backward/sideways scattering

    for (let i = 0; i < 3; i++) {
      const scatterAngle = angleAway + scatterOffsets[i];
      const offsetDist = 10;
      const sx = x + Math.cos(scatterAngle) * offsetDist;
      const sy = y + Math.sin(scatterAngle) * offsetDist;

      const vx = Math.cos(scatterAngle) * burstSpeed;
      const vy = Math.sin(scatterAngle) * burstSpeed;

      const shardId = world.createEntity();
      world.addComponent(shardId, new TransformComponent(sx, sy, scatterAngle));
      world.addComponent(shardId, new VelocityComponent(vx, vy, archetype.baseSpeed, archetype.baseSpeed));
      world.addComponent(shardId, new CircleColliderComponent(archetype.radius, archetype.mass, false));
      world.addComponent(shardId, new HealthComponent(scaledHp, scaledHp, 0));
      world.addComponent(shardId, new ArmorComponent(0, 0));
      world.addComponent(shardId, new RenderComponent(
        'polygon',
        archetype.sides,
        archetype.radius,
        archetype.color,
        archetype.glowColor,
        archetype.glowBlur
      ));

      const enemyComp = new EnemyComponent(
        archetype.type,
        archetype.baseReward,
        false,
        0,
        0,
        0,
        (i % 2 === 0 ? 1 : -1) * 3.5,
        scaledDamage
      );
      enemyComp.scatterTimer = scatterDuration;
      world.addComponent(shardId, enemyComp);

      world.eventBus.emit('ENEMY_SPAWNED', {
        entityId: shardId,
        type: archetype.type,
        hp: scaledHp,
        damage: scaledDamage
      });
    }

    // Keep wave counters in sync
    this.totalEnemiesInWave += 3;
    this.enemiesSpawned += 3;
  }
}
