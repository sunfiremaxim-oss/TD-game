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
import { FighterFlightComponent } from '../components/FighterFlightComponent.js';
import { TowerComponent } from '../components/TowerComponent.js';
import { AttackComponent } from '../components/AttackComponent.js';
import { GameConfig } from '../config/GameConfig.js';
import { DevControlComponent } from '../components/DevControlComponent.js';
import { getStage } from '../config/StageConfig.js';
import { ArchitectDrillComponent } from '../components/ArchitectDrillComponent.js';
import { ArchitectSiegeComponent } from '../components/ArchitectSiegeComponent.js';
import { CarrierComponent } from '../components/CarrierComponent.js';
import { RailgunComponent } from '../components/RailgunComponent.js';
import { CitadelComponent, CitadelGeneratorComponent } from '../components/CitadelComponent.js';
import { FractalComponent, FractalBranchComponent } from '../components/FractalComponent.js';

export class WaveSystem {
  constructor() {
    this.stageId = null; // null retains the endless sandbox used by diagnostics/devtools.
    this.currentWave = 1;
    this.state = 'IDLE'; // Idle until game starts
    this.intermissionTimer = 0;
    this.intermissionDuration = GameConfig.waves.intermissionDuration || 5.0;

    this.spawnQueue = [];
    this.spawnInterval = 1.2;
    this.spawnTimer = 0.3; // First enemy spawns in 0.3s
    this.totalEnemiesInWave = 0;
    this.enemiesSpawned = 0;
    this.fractalProgressDirty = false;
  }

  init(world) {
    world.eventBus.on('ENTITY_DIED', event => {
      if (event.isEnemy) this._spawnFractalChildren(world,event.entityId);
    });
    world.eventBus.on('CARRIER_LAUNCH', ({ carrierId }) => this._spawnCarrierWing(world, carrierId));
    world.eventBus.on('SPLITTER_SPLIT', (event) => {
      this._spawnSplitterShards(world, event.x, event.y);
    });
  }

  startFirstWave(world, stageId = null) {
    if (stageId !== null && !getStage(stageId)) return false;
    this.stageId = stageId;
    world.stageId = stageId;
    world.runOutcome = null;
    this.currentWave = 1;
    this.state = 'ACTIVE';
    this._startWave(world);
    return true;
  }

  reset() {
    this.fractalProgressDirty = false;
    this.stageId = null;
    this.currentWave = 1;
    this.state = 'IDLE';
    this.intermissionTimer = 0;
    this.spawnQueue = [];
    this.spawnInterval = 1.2;
    this.spawnTimer = 0.3;
    this.totalEnemiesInWave = 0;
    this.enemiesSpawned = 0;
  }

  update(world, deltaTime) {
    if (this.fractalProgressDirty && !world.isGameOver && !world.inMenu) {
      this.fractalProgressDirty = false;
      world.eventBus.emit('WAVE_PROGRESS',{wave:this.currentWave,total:this.totalEnemiesInWave,spawned:this.enemiesSpawned,
        alive:world.getEntitiesWith(EnemyComponent,HealthComponent).filter(id=>world.getComponent(id,HealthComponent).current>0).length});
    }
    if (this.state === 'IDLE' || world.isGameOver) return;
    const devId = world.getEntitiesWith(DevControlComponent)[0];
    const dev = devId === undefined ? null : world.getComponent(devId, DevControlComponent);
    if (GameConfig.devTools.enabled && dev?.enabled && dev.wavesFrozen) return;

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

        const nonShieldEnemies = world.getEntitiesWith(EnemyComponent).filter(id => {
          const comp = world.getComponent(id, EnemyComponent);
          return comp && comp.type !== 'boss_shield';
        });

        world.eventBus.emit('WAVE_PROGRESS', {
          wave: this.currentWave,
          spawned: this.enemiesSpawned,
          total: this.totalEnemiesInWave,
          alive: nonShieldEnemies.length
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
      stage: this.stageId,
      finalWave: getStage(this.stageId)?.waves,
      isBoss: this._isBossWave(this.currentWave),
      totalEnemies: this.totalEnemiesInWave
    });
  }

  _completeWave(world) {
    if (this.state !== 'ACTIVE' || world.isGameOver) return;
    world.eventBus.emit('WAVE_COMPLETED', {
      wave: this.currentWave
    });

    const stage = getStage(this.stageId);
    if (stage && this.currentWave === stage.waves) {
      this.state = 'COMPLETE';
      world.isGameOver = true;
      world.isPaused = true;
      world.runOutcome = 'victory';
      world.eventBus.emit('STAGE_COMPLETED', { stage: stage.id, wave: this.currentWave });
      return;
    }

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
    if (getStage(this.stageId)) return this._generateStageEnemies(wave);
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

  _isBossWave(wave) {
    const stage = getStage(this.stageId);
    return stage ? Boolean(stage.boss) && wave === stage.waves : wave % 10 === 0;
  }

  _generateStageEnemies(wave) {
    const stage = getStage(this.stageId);
    if (!Number.isInteger(wave) || wave < 1 || wave > stage.waves) return [];
    if (this._isBossWave(wave)) return [stage.boss];
    const roster = wave <= 10 ? stage.firstHalf : stage.secondHalf;
    const count = 9 + (wave - 1) + Math.floor((stage.id - 1) * 0.75);
    const weights = stage.id === 8 && wave > 10
      ? { scout: 20, fighter: 30, tank: 24, sniper: 16, aegis: 4, splitter: 3, blinker: 3 }
      : { scout: 35, fighter: 25, tank: 18, sniper: 12, aegis: 3, splitter: 4, blinker: 3 };
    // Include each unlocked type, then distribute remaining slots proportionally.
    const list = [...roster], allocated = roster.map(() => 0);
    const totalWeight = roster.reduce((sum, type) => sum + weights[type], 0);
    const remaining = count - list.length;
    for (let i = 0; i < remaining; i++) {
      let best = 0;
      for (let j = 1; j < roster.length; j++) {
        if (weights[roster[j]] / totalWeight * (i + 1) - allocated[j]
          > weights[roster[best]] / totalWeight * (i + 1) - allocated[best]) best = j;
      }
      allocated[best]++;
      list.push(roster[best]);
    }
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }

  _spawnEnemy(world, type, overrides = {}) {
    const archetype = GameConfig.enemies[type];
    if (!archetype) return;

    const enemyId = world.createEntity();
    const w = world.width || 1200;
    const h = world.height || 800;
    const centerX = w / 2;
    const centerY = h / 2;

    // Guaranteed off-screen perimeter spawn adapted to current canvas dimensions & aspect ratio:
    // Architect bounds include its solid hull and the baked glow, without satellites.
    // Standard enemies have radius up to 22 + glowBlur 14.
    const baseMargin = type === 'boss_fractal' ? archetype.branchOrbit+GameConfig.enemies.fractal_branch.radius+30
      : type === 'boss_citadel' ? archetype.generatorOrbit + GameConfig.enemies.citadel_generator.radius + 30
      : type.startsWith('boss_') ? archetype.radius + 30 : 55;
    // Add small random depth jitter (0 to 25px) so units don't spawn in a rigid flat line
    const margin = baseMargin + Math.random() * 25;

    // Uniformly sample along the perimeter of the bounding box expanded by `margin`:
    // Box dimensions: [-margin, w + margin] x [-margin, h + margin]
    const boxW = w + 2 * margin;
    const boxH = h + 2 * margin;
    const perimeter = 2 * (boxW + boxH);
    const p = Math.random() * perimeter;

    let spawnX, spawnY;
    if (p < boxW) {
      // Top edge (completely above visible screen)
      spawnX = -margin + p;
      spawnY = -margin;
    } else if (p < boxW + boxH) {
      // Right edge (completely right of visible screen)
      spawnX = w + margin;
      spawnY = -margin + (p - boxW);
    } else if (p < 2 * boxW + boxH) {
      // Bottom edge (completely below visible screen)
      spawnX = -margin + (p - (boxW + boxH));
      spawnY = h + margin;
    } else {
      // Left edge (completely left of visible screen)
      spawnX = -margin;
      spawnY = -margin + (p - (2 * boxW + boxH));
    }

    // 1. Micro-jitter speed variation (±5% to ±8%)
    const jitterMin = GameConfig.waves.speedJitterMin || -0.07;
    const jitterMax = GameConfig.waves.speedJitterMax || 0.07;
    const jitter = 1 + (jitterMin + Math.random() * (jitterMax - jitterMin));
    const finalSpeed = archetype.baseSpeed * jitter;

    // 2. Exponential stat scaling for higher waves
    // HP = BaseHP * (1.10 ^ (Wave - 1))
    // Damage = BaseDmg * (1.07 ^ (Wave - 1))
    const wave = this.currentWave;
    const stage = getStage(this.stageId);
    const hpMultiplier = Math.pow(GameConfig.waves.hpScaleFactor, wave - 1) * (stage?.hpMultiplier || 1);
    const scaledHp = Math.max(1, Math.round(archetype.baseHp * hpMultiplier * (overrides.hpMultiplier ?? 1)));

    const dmgMultiplier = Math.pow(GameConfig.waves.damageScaleFactor, wave - 1) * (stage?.damageMultiplier || 1);
    const scaledDamage = Math.max(1, Math.round(archetype.baseDamage * dmgMultiplier * (overrides.damageMultiplier ?? 1)));

    const rewardMultiplier = Math.pow(GameConfig.waves.rewardScaleFactor || 1.04, Math.max(0, wave - 1)) * (stage?.rewardMultiplier || 1);
    const scaledReward = Math.max(1, Math.round(archetype.baseReward * rewardMultiplier * (overrides.rewardMultiplier ?? 1)));

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
    } else if (archetype.type === 'boss_architect' || archetype.type === 'boss_scout') {
      rotSpeed = (Math.random() < 0.5 ? -1 : 1) * archetype.rotationSpeed;
    }

    const angleToCenter = Math.atan2(centerY - spawnY, centerX - spawnX);
    const initialRotation = (archetype.type === 'scout' || archetype.type === 'tank' || archetype.type === 'aegis' || archetype.type === 'boss_architect' || archetype.type === 'boss_scout')
      ? Math.random() * Math.PI * 2
      : angleToCenter;

    world.addComponent(enemyId, new TransformComponent(overrides.x ?? spawnX, overrides.y ?? spawnY, overrides.rotation ?? initialRotation));
    world.addComponent(enemyId, new VelocityComponent(0, 0, archetype.baseSpeed, finalSpeed));
    world.addComponent(enemyId, new CircleColliderComponent(archetype.radius, archetype.mass, false));
    if (type === 'fighter') {
      const flight = archetype.flight;
      world.addComponent(enemyId, new FighterFlightComponent(overrides.direction ?? (Math.random() < 0.5 ? -1 : 1),
        flight.spiralMin + Math.random() * (flight.spiralMax - flight.spiralMin)));
    }
    if (type === 'boss_architect') {
      world.addComponent(enemyId, new ArchitectDrillComponent());
      world.addComponent(enemyId, new ArchitectSiegeComponent());
    }
    if (type === 'boss_carrier') {
      const carrier = new CarrierComponent(); carrier.orbitDirection = Math.random() < .5 ? -1 : 1;
      world.addComponent(enemyId, carrier);
    }
    if (type === 'boss_railgun') {
      const rail = new RailgunComponent(); rail.orbitDirection = Math.random() < .5 ? -1 : 1;
      world.addComponent(enemyId,rail);
    }
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
      scaledReward,
      isSniper,
      isSniper ? (GameConfig.enemies.sniper.initialAimDelay || 0.45) : 0, // initial shootCooldown
      archetype.shootInterval || 2.8,
      stopDistance,
      rotSpeed,
      scaledDamage,
      1.0,
      archetype.shieldDomeRadius || 0
    );

    world.addComponent(enemyId, enemyComp);

    if (type === 'fractal_branch' || type === 'fractal_fragment' || type === 'fractal_shard') {
      const depth = type === 'fractal_branch' ? 0 : type === 'fractal_fragment' ? 1 : 2;
      world.addComponent(enemyId,new FractalBranchComponent(overrides.fractalOwnerId??null,overrides.fractalOwnerHealth??null,
        overrides.fractalSlot??0,depth,overrides.fractalAttached??false));
      world.getComponent(enemyId,CircleColliderComponent).isStatic = !!overrides.fractalAttached;
      enemyComp.baseReward = 0;
    }
    if (type === 'boss_fractal') {
      const fractal = new FractalComponent(),health = world.getComponent(enemyId,HealthComponent);
      const position = world.getComponent(enemyId,TransformComponent);
      world.addComponent(enemyId,fractal);
      enemyComp.rotationSpeed = (Math.random()<.5?-1:1)*archetype.rotationSpeed;
      for (let slot=0;slot<4;slot++) {
        const angle = position.rotation+slot*Math.PI/2;
        const id = this._spawnEnemy(world,'fractal_branch',{x:position.x+Math.cos(angle)*archetype.branchOrbit,
          y:position.y+Math.sin(angle)*archetype.branchOrbit,rotation:angle,
          fractalOwnerId:enemyId,fractalOwnerHealth:health,fractalSlot:slot,fractalAttached:true});
        fractal.branches.push({id,health:world.getComponent(id,HealthComponent)});
      }
      this.totalEnemiesInWave+=4;this.enemiesSpawned+=4;
    }

    if (type === 'boss_citadel') {
      const citadel = new CitadelComponent();
      world.addComponent(enemyId,citadel);
      enemyComp.rotationSpeed = (Math.random() < .5 ? -1 : 1) * archetype.rotationSpeed;
      const ownerHealth = world.getComponent(enemyId,HealthComponent);
      const position = world.getComponent(enemyId,TransformComponent);
      for (let slot = 0; slot < 6; slot++) {
        const angle = position.rotation + slot * Math.PI / 3;
        const id = this._spawnEnemy(world,'citadel_generator', {
          x:position.x+Math.cos(angle)*archetype.generatorOrbit,
          y:position.y+Math.sin(angle)*archetype.generatorOrbit, rotation:angle
        });
        world.addComponent(id,new CitadelGeneratorComponent(enemyId,ownerHealth,slot));
        // Attached modules are not independent physics bodies.
        world.getComponent(id,CircleColliderComponent).isStatic = true;
        world.getComponent(id,EnemyComponent).baseReward = 0;
        citadel.generators.push({id,health:world.getComponent(id,HealthComponent)});
      }
      this.totalEnemiesInWave += 6; this.enemiesSpawned += 6;
    }

    world.eventBus.emit('ENEMY_SPAWNED', {
      entityId: enemyId,
      type: archetype.type,
      hp: scaledHp,
      damage: scaledDamage
    });
    return enemyId;
  }

  _spawnCarrierWing(world, id) {
    const carrier = world.getComponent(id, CarrierComponent), health = world.getComponent(id, HealthComponent);
    const position = world.getComponent(id, TransformComponent);
    if (!carrier?.pendingLaunch || carrier.phase !== 'launch' || carrier.launches < 1 || carrier.launches > GameConfig.enemies.boss_carrier.maxLaunches ||
        !health || health.current <= 0 || !position || world.isGameOver || world.inMenu || world.destructionQueue.has(id)) return;
    carrier.pendingLaunch = false; // Consume once, including re-entrant/replayed events.
    const tower = world.getEntitiesWith(TowerComponent, TransformComponent)[0];
    if (tower === undefined) return;
    const target = world.getComponent(tower, TransformComponent), cfg = GameConfig.enemies.boss_carrier;
    const angle = Math.atan2(target.y - position.y, target.x - position.x), nx = Math.cos(angle), ny = Math.sin(angle);
    const offset = cfg.radius + GameConfig.enemies.fighter.radius + 8;
    for (let i = 0; i < cfg.wingSize; i++) {
      if (health.current <= 0 || world.destructionQueue.has(id) || world.isGameOver || world.inMenu) break;
      const side = i % 2 ? 1 : -1;
      this._spawnEnemy(world, 'fighter', { x: position.x + nx * 8 - ny * offset * side,
        y: position.y + ny * 8 + nx * offset * side, rotation: angle, direction: side,
        hpMultiplier: cfg.fighterHpMultiplier, damageMultiplier: cfg.fighterDamageMultiplier, rewardMultiplier: cfg.fighterRewardMultiplier });
      this.totalEnemiesInWave++; this.enemiesSpawned++;
    }
    world.eventBus.emit('WAVE_PROGRESS', { wave: this.currentWave, total: this.totalEnemiesInWave, spawned: this.enemiesSpawned,
      alive: world.getEntitiesWith(EnemyComponent).filter(entity => world.getComponent(entity, EnemyComponent).type !== 'boss_shield').length });
  }

  _spawnFractalChildren(world,id) {
    const branch = world.getComponent(id,FractalBranchComponent),health = world.getComponent(id,HealthComponent);
    const position = world.getComponent(id,TransformComponent);
    if (!branch?.pendingSplit || branch.depth>=2 || !health || health.current>0 || !position || world.inMenu || world.isGameOver) return;
    branch.pendingSplit = false; // Consume before spawning; re-entrant death events cannot duplicate a lineage.
    const type = branch.depth===0?'fractal_fragment':'fractal_shard',cfg = GameConfig.enemies[type];
    const tower = world.getEntitiesWith(TowerComponent,TransformComponent)[0];
    const target = tower===undefined?{x:world.width/2,y:world.height/2}:world.getComponent(tower,TransformComponent);
    const away = Math.atan2(position.y-target.y,position.x-target.x);
    for (let slot=0;slot<GameConfig.enemies.boss_fractal.splitCount;slot++) {
      const angle = away+(slot-1)*.8;
      const child = this._spawnEnemy(world,type,{x:position.x+Math.cos(angle)*(cfg.radius+4),
        y:position.y+Math.sin(angle)*(cfg.radius+4),rotation:angle,
        fractalOwnerId:branch.ownerId,fractalOwnerHealth:branch.ownerHealth,fractalSlot:slot});
      const velocity = world.getComponent(child,VelocityComponent);
      velocity.vx=Math.cos(angle)*100;velocity.vy=Math.sin(angle)*100;
      world.getComponent(child,EnemyComponent).scatterTimer=.24;
      this.totalEnemiesInWave++;this.enemiesSpawned++;
    }
    this.fractalProgressDirty = true;
  }

  _spawnSplitterShards(world, x, y) {
    const archetype = GameConfig.enemies.splitter_shard;
    if (!archetype) return;

    const stage = getStage(this.stageId);
    const hpMultiplier = Math.pow(GameConfig.waves.hpScaleFactor, this.currentWave - 1) * (stage?.hpMultiplier || 1);
    const scaledHp = Math.round(archetype.baseHp * hpMultiplier);
    const dmgMultiplier = Math.pow(GameConfig.waves.damageScaleFactor, this.currentWave - 1) * (stage?.damageMultiplier || 1);
    const scaledDamage = Math.max(1, Math.round(archetype.baseDamage * dmgMultiplier));
    const rewardMultiplier = Math.pow(GameConfig.waves.rewardScaleFactor || 1.04, Math.max(0, this.currentWave - 1)) * (stage?.rewardMultiplier || 1);
    const scaledReward = Math.max(1, Math.round(archetype.baseReward * rewardMultiplier));

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
        scaledReward,
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
