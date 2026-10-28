/**
 * GameConfig.js
 * Central configuration for constants, enemy archetypes, visual styles, and upgrades.
 */

import { t } from '../i18n/I18n.js';

export const GameConfig = {
  devTools: { enabled: true }, // Temporary desktop playtest panel. One switch removes its UI and effects.
  // Canvas and coordinate settings
  canvas: {
    width: 1200,
    height: 800,
    backgroundColor: '#0a0b10',
    gridColor: 'rgba(0, 243, 255, 0.05)',
    gridSize: 40
  },

  // Style palette (Geometric Neon Cyberpunk)
  colors: {
    background: '#0a0b10',
    tower: '#00f3ff',
    towerCore: '#ffffff',
    towerGlow: '#00f3ff',
    rangeRing: 'rgba(0, 243, 255, 0.12)',
    rangeRingBorder: 'rgba(0, 243, 255, 0.35)',
    
    // Enemy colors
    scout: '#ffe600',       // Yellow
    fighter: '#ff0055',     // Crimson / Red
    tank: '#9d00ff',        // Purple
    sniper: '#ff7700',      // Orange

    // Combat & UI
    projectile: '#00f3ff',
    enemyProjectile: '#ff7700',
    critText: '#ffe600',
    normalDamageText: '#ffffff',
    towerDamageText: '#ff0055',
    healthGreen: '#00ff66',
    healthRed: '#ff2255'
  },

  // Tower default base parameters
  tower: {
    radius: 26,
    colliderRadius: 26,
    barrelExtension: 14,
    barrelWidth: 6,
    muzzleInset: 10, // Bolt centers start inside the last section of the barrel.
    baseHealth: 300,
    baseRegen: 1.0,
    baseDamage: 25,
    baseAttackSpeed: 1.6, // attacks per second
    aimTurnIntervalFraction: 0.14, // A 180-degree turn takes this fraction of a shot interval.
    aimAfterShotHoldFraction: 0.12, // Briefly retain the firing direction after each volley.
    baseRange: 130,       // Initial attack zone 2x smaller (130px)
    baseCritChance: 0.08,
    baseCritMultiplier: 1.6,
    baseMultishotCount: 1,
    baseMultishotChance: 0.0,
    basePercentArmor: 0.0,
    baseFlatArmor: 0,
    baseDistanceDamageCoeff: 0.0,
    startCredits: 0
  },

  // Enemy archetypes
  enemies: {
    scout: {
      type: 'scout',
      sides: 3,             // Triangle
      radius: 12,
      baseSpeed: 73.5,
      mass: 1.0,
      baseHp: 25,           // One base hit on stage 1 wave 1; 28 HP on wave 2.
      baseDamage: 12,
      baseReward: 10,
      color: '#ffe600',
      glowColor: '#ffe600',
      glowBlur: 10
    },
    fighter: {
      type: 'fighter',
      sides: 4,             // Dart / Sharp diamond
      radius: 11,
      baseSpeed: 108.5,     // Fast
      flight: {
        spiralMin: 2.6, spiralMax: 3.4, // Tangential / inward velocity; chosen once per fighter.
        unwindDistance: 44,
        lookAhead: 0.85,
        reactionTime: 0.26,
        clearance: 7,
        turnSpeed: 9
      },
      escort: {
        seekDistance: 350, // Independent tank search, like a sniper seeking Aegis.
        detachDistance: 450, // Hysteresis: do not lose a newly found distant tank next frame.
        rearGap: 10,
        joinTolerance: 8,
        followGain: 4,
        releaseDepth: 0.5,
        chargeMultiplier: 1.65,
        accelerationTime: 0.55
      },
      mass: 0.7,            // Light mass, pushes away easily
      baseHp: 32,
      baseDamage: 18,
      baseReward: 14,
      color: '#ff0055',
      glowColor: '#ff0055',
      glowBlur: 12
    },
    tank: {
      type: 'tank',
      sides: 6,             // Hexagon
      radius: 22,
      baseSpeed: 36.4,      // Slow
      mass: 8.0,            // Heavy mass, almost immovable
      baseHp: 220,
      baseDamage: 45,
      baseReward: 35,
      color: '#9d00ff',
      glowColor: '#9d00ff',
      glowBlur: 14
    },
    sniper: {
      type: 'sniper',
      sides: 4,             // Diamond
      radius: 14,
      baseSpeed: 56,
      mass: 1.5,
      baseHp: 53,           // About 30% less HP for the ranged archetype
      baseDamage: 22,
      baseReward: 25,
      stopDistance: 240,    // Scaled for tighter base perimeter
      aegisSeekDistance: 350, // Max distance to seek and escort a nearby Aegis fortress
      shootInterval: 2.8,   // Shoots every 2.8s
      initialAimDelay: 0.45, // Aiming delay before first shot so tower has reaction time
      projectileSpeed: 220,
      color: '#ff7700',
      glowColor: '#ff7700',
      glowBlur: 12
    },

    // 1. Пентагон «Эгида» (Aegis) - Turquoise pentagon, slow, defensive 50% dome
    aegis: {
      type: 'aegis',
      sides: 5,             // Pentagon
      radius: 19,
      baseSpeed: 33.6,      // Slow fortress
      mass: 4.5,
      baseHp: 180,
      baseDamage: 25,
      baseReward: 40,
      shieldDomeRadius: 115,
      damageReduction: 0.50, // 50% damage reduction for allies inside dome
      color: '#00e5ff',
      glowColor: '#00e5ff',
      glowBlur: 14
    },

    // 2. Фрактал «Сплиттер» (Splitter) - Green triangle fractal, splits on death
    splitter: {
      type: 'splitter',
      sides: 3,             // Triangle fractal
      radius: 14,
      baseSpeed: 57.4,
      mass: 1.2,
      baseHp: 65,
      baseDamage: 18,
      baseReward: 25,
      color: '#00ff66',
      glowColor: '#00ff66',
      glowBlur: 12
    },
    splitter_shard: {
      type: 'splitter_shard',
      sides: 3,             // Fast small triangle shard
      radius: 7,
      baseSpeed: 129.5,     // Fast sprint to tower
      mass: 0.4,
      baseHp: 18,
      baseDamage: 10,
      baseReward: 6,
      color: '#39ff14',
      glowColor: '#39ff14',
      glowBlur: 8
    },

    // 3. Вектор «Блинкер» (Blinker) - White lightning vector, 2s teleport dash
    blinker: {
      type: 'blinker',
      sides: 4,             // Zigzag lightning
      radius: 13,
      baseSpeed: 66.5,
      mass: 0.8,
      baseHp: 52,
      baseDamage: 18,
      baseReward: 22,
      blinkInterval: 2.0,   // Blinks every 2s
      blinkDistance: 75,    // 75px dash
      color: '#ffffff',
      glowColor: '#00ffff',
      glowBlur: 14
    },

    // First-stage boss: a larger scout, using ordinary direct movement and melee.
    boss_scout: {
      type: 'boss_scout', sides: 3, radius: 48, baseSpeed: 50, mass: 8,
      baseHp: 320, baseDamage: 20, baseReward: 350,
      rotationSpeed: .42,
      color: '#ffe174', glowColor: '#ffd338', glowBlur: 12
    },
    // Monolith: retain the legacy boss_architect ID for existing combat code.
    boss_architect: {
      type: 'boss_architect',
      sides: 8,
      radius: 66,
      baseSpeed: 45,
      mass: 30.0,
      baseHp: 400,          // Stage 3 finale: 3822 HP after wave/stage scaling.
      baseDamage: 20,       // Stage 3 finale: 96 drill DPS before mitigation.
      drillGap: 26,
      rotationSpeed: 0.204,  // Flight and final alignment: +70% from 0.12 rad/s.
      drillTickInterval: 0.05,
      siegeWindup: 1.2,
      siegeDrillDuration: 4,
      siegeCoolingDuration: 2.5,
      approachDamageMultiplier: .65,
      overheatedDamageMultiplier: 1.5,
      baseReward: 350,
      color: '#ff7189',
      glowColor: '#ff536e',
      glowBlur: 14
    },
    // Stage-two boss: a mobile carrier with finite fighter wings and exposed-core windows.
    boss_carrier: {
      type: 'boss_carrier', sides: 6, radius: 78, baseSpeed: 38, mass: 18,
      baseHp: 220, baseDamage: 8, baseReward: 450,
      color: '#ff4d8b', glowColor: '#ff0055', glowBlur: 13,
      orbitSpeed: .22, shootInterval: 3.2, projectileSpeed: 190,
      maxLaunches: 3, wingSize: 2, launchWarning: 1.2, exposedDuration: 3.8, reloadDuration: 2,
      closedDamageMultiplier: .8, exposedDamageMultiplier: 1.4,
      fighterHpMultiplier: .45, fighterDamageMultiplier: .5, fighterRewardMultiplier: .5
    },
    // Stage-four sniper boss: telegraphed rail shot, cooling window, lateral reposition.
    boss_railgun: {
      type: 'boss_railgun', sides: 4, radius: 62, baseSpeed: 43, mass: 20,
      baseHp: 360, baseDamage: 24, baseReward: 500,
      color: '#ffb665', glowColor: '#ff7a26', glowBlur: 12,
      chargeDuration: 1.6, beamDuration: .22, cooldownDuration: 1.1,
      repositionDuration: 2.2, orbitSpeed: .30, coolingShieldHpFraction: .08
    },
    // Stage-five fortress: six destructible generators, then an exposed hull.
    boss_citadel: {
      type: 'boss_citadel', sides: 6, radius: 48, baseSpeed: 36, mass: 28,
      baseHp: 260, baseDamage: 32, baseReward: 550,
      color: '#a8daff', glowColor: '#628dff', glowBlur: 12,
      rotationSpeed: .48, generatorOrbit: 58, shootInterval: 3, projectileSpeed: 170
    },
    citadel_generator: {
      type: 'citadel_generator', sides: 6, radius: 14, baseSpeed: 0, mass: 10,
      baseHp: 28, baseDamage: 0, baseReward: 0,
      color: '#7de6ff', glowColor: '#488fff', glowBlur: 8
    },
    boss_fractal: {
      type: 'boss_fractal', sides: 4, radius: 30, baseSpeed: 33, mass: 20,
      baseHp: 180, baseDamage: 32, baseReward: 600,
      color: '#83ffc2', glowColor: '#37f593', glowBlur: 10,
      branchOrbit: 54, rotationSpeed: .20, detachHealthFraction: .5,
      chargeDuration: .85, beamDuration: .20, cooldownDuration: 2.5, damageFloor: .20, splitCount: 3
    },
    fractal_branch: {
      type: 'fractal_branch', sides: 4, radius: 36, baseSpeed: 34, mass: 5,
      baseHp: 35, baseDamage: 5, baseReward: 0,
      color: '#86ffc0', glowColor: '#39ff98', glowBlur: 9
    },
    fractal_fragment: {
      type: 'fractal_fragment', sides: 4, radius: 12, baseSpeed: 46, mass: 1.3,
      baseHp: 12, baseDamage: 2, baseReward: 0,
      color: '#a8ffce', glowColor: '#43ffa2', glowBlur: 7
    },
    fractal_shard: {
      type: 'fractal_shard', sides: 4, radius: 7, baseSpeed: 66, mass: .5,
      baseHp: 4, baseDamage: .5, baseReward: 0,
      color: '#caffdf', glowColor: '#67ffaf', glowBlur: 5
    },
    // Legacy segments retained for projectile/orbit regression fixtures; not spawned in gameplay.
    boss_shield: {
      type: 'boss_shield',
      sides: 6,
      radius: 12,
      baseSpeed: 0,
      mass: 15.0,
      baseHp: 140,          // Segment HP
      baseDamage: 10,
      baseReward: 15,
      color: '#00f3ff',
      glowColor: '#00f3ff',
      glowBlur: 12
    }
  },

  // Waves & pacing rules
  waves: {
    intermissionDuration: 5.0, // 5 seconds intermission phase
    speedJitterMin: -0.07,     // -7%
    speedJitterMax: 0.07,      // +7%
    hpScaleFactor: 1.10,       // HP = BaseHP * (1.10 ^ (Wave - 1))
    damageScaleFactor: 1.07,   // Damage = BaseDmg * (1.07 ^ (Wave - 1))
    waveBaseReward: 10,
    waveRewardGrowth: 5,
    rewardScaleFactor: 1.04    // Smooth economy scaling: Reward = BaseReward * (1.04 ^ (Wave - 1))
  },

  // Physics separation constants
  physics: {
    separationPushStrength: 0.65
  },

  // Projectile settings
  projectile: {
    speed: 550,
    radius: 4,
    maxLifetime: 2.5
  },

  // Special mechanics: all distances are logical world pixels, times are game seconds.
  combat: {
    ricochetRadius: 110,
    ricochetDamageRetention: 0.70,
    rapidFireMultiplier: 1.5,
    lifeStealMaxHpPerSecond: 0.015, // One second of healing may be banked for a burst.
    knockbackDuration: 0.16,
    knockbackRecovery: 1.25, // Per enemy, shared by all bullets and ricochets.
    bossKnockbackMultiplier: 0.15
  },

  crystals: {
    baseDropChance: 0.01,
    killReward: 1,
    waveBaseReward: 2,
    waveRewardGrowth: 1
  },

  // Battle prices use credits at one fifth of the permanent microchip price.
  battleUpgradeCostMultiplier: 0.2,
  enemyCreditRewardMultiplier: 0.2,

  // Upgrade definitions and progression (including level-zero values for new abilities).
  upgrades: {
    // OFFENSE
    damage: {
      id: 'damage',
      category: 'offense',
      name: 'Урон оружия',
      icon: '⚡',
      baseCost: 25,
      costMultiplier: 1.25,
      valuePerLevel: 6,
      format: (val) => `${val.toFixed(0)} DMG`
    },
    attackSpeed: {
      id: 'attackSpeed',
      category: 'offense',
      name: 'Скорость атаки',
      icon: '🔄',
      baseCost: 35,
      costMultiplier: 1.28,
      valuePerLevel: 0.15,
      format: (val) => t('{value} /сек', { value: val.toFixed(2) })
    },
    range: {
      id: 'range',
      category: 'offense',
      name: 'Расширение зоны атаки',
      icon: '📡',
      baseCost: 30,
      costMultiplier: 1.25,
      valuePerLevel: 8, // +8px radius per level (reduced from 20px)
      format: (val) => `${val.toFixed(0)} px`
    },
    critChance: {
      id: 'critChance',
      category: 'offense',
      name: 'Шанс крит. атаки',
      icon: '🎯',
      baseCost: 40,
      costMultiplier: 1.32,
      valuePerLevel: 0.02, // +2%
      format: (val) => `${(val * 100).toFixed(0)}%`
    },
    critDamage: {
      id: 'critDamage',
      category: 'offense',
      name: 'Крит. урон',
      icon: '💥',
      baseCost: 45,
      costMultiplier: 1.30,
      valuePerLevel: 0.25, // +25%
      format: (val) => `${val.toFixed(2)}x`
    },
    multishotChance: {
      id: 'multishotChance',
      category: 'offense',
      name: 'Шанс мультивыстрела',
      icon: '✨',
      baseCost: 45,
      costMultiplier: 1.30,
      valuePerLevel: 0.005, // +0.5% per level (smooth, balanced scaling)
      format: (val) => `${(val * 100).toFixed(1)}%`
    },
    multishotTargets: {
      id: 'multishotTargets',
      category: 'offense',
      name: 'Цели мультивыстрела',
      icon: '🔱',
      baseCost: 80,
      costMultiplier: 1.70,
      valuePerLevel: 1, // +1 projectile
      requires: { id: 'multishotChance', minLevel: 1 },
      format: (val) => t('+{value} цели', { value: val })
    },
    ricochetChance: {
      id: 'ricochetChance', category: 'offense', name: 'Шанс рикошета', icon: '↪',
      description: 'Шанс начать цепочку при попадании. Радиус перехода 110 px, каждый переход сохраняет 70% урона; повторные попадания в ту же цель исключены.',
      baseCost: 70, costMultiplier: 1.30, baseValue: 0, valuePerLevel: 0.0125,
      format: val => `${(val * 100).toFixed(2)}%`
    },
    ricochetCount: {
      id: 'ricochetCount', category: 'offense', name: 'Количество рикошетов', icon: '↪',
      description: 'Максимум дополнительных целей в одной сработавшей цепочке рикошетов.',
      baseCost: 100, costMultiplier: 1.70, baseValue: 1, valuePerLevel: 1,
      requires: { id: 'ricochetChance', minLevel: 1 }, format: val => `${val.toFixed(0)}`
    },
    rapidFireChance: {
      id: 'rapidFireChance', category: 'offense', name: 'Шанс быстрой атаки', icon: '»',
      description: 'Шанс ускорить атаку ×1.5 при залпе. Первая покупка даёт +1 п.п., каждая следующая прибавка умножается на 0.98. Уровни не ограничены. Без кулдауна, суммирования и продления активного эффекта.',
      baseCost: 60, costMultiplier: 1.60, baseValue: 0, valuePerLevel: 0.01, valueDecay: 0.98,
      format: val => `${(val * 100).toFixed(2)}%`
    },
    rapidFireDuration: {
      id: 'rapidFireDuration', category: 'offense', name: 'Длительность быстрой атаки', icon: '◷',
      description: 'Время действия ускорения ×1.5: от 0.5 с, +0.15 с за уровень без ограничения уровней. Пауза игры останавливает отсчёт.',
      baseCost: 65, costMultiplier: 1.40, baseValue: 0.5, valuePerLevel: 0.15,
      requires: { id: 'rapidFireChance', minLevel: 1 }, format: val => t('{value} с', { value: val.toFixed(2) })
    },

    // DEFENSE
    maxHealth: {
      id: 'maxHealth',
      category: 'defense',
      name: 'Макс. прочность',
      icon: '🛡️',
      baseCost: 30,
      costMultiplier: 1.25,
      valuePerLevel: 80,
      format: (val) => `${val.toFixed(0)} HP`
    },
    armorPercent: {
      id: 'armorPercent',
      category: 'defense',
      name: 'Броня %',
      icon: '🔷',
      baseCost: 40,
      costMultiplier: 1.32,
      valuePerLevel: 0.03, // +3%
      format: (val) => `${(val * 100).toFixed(0)}%`
    },
    flatArmor: {
      id: 'flatArmor',
      category: 'defense',
      name: 'Поглощение урона',
      icon: '🧱',
      baseCost: 35,
      costMultiplier: 1.28,
      valuePerLevel: 3, // -3 damage flat
      format: (val) => `-${val.toFixed(0)} DMG`
    },
    healthRegen: {
      id: 'healthRegen',
      category: 'defense',
      name: 'Регенерация HP',
      icon: '💚',
      baseCost: 40,
      costMultiplier: 1.30,
      valuePerLevel: 1.5, // +1.5 HP/sec
      format: (val) => t('+{value}/сек', { value: val.toFixed(1) })
    },
    damageReflection: {
      id: 'damageReflection', category: 'defense', name: 'Отражение урона', icon: '◇',
      description: 'Возвращает атакующему часть фактически потерянного HP после брони. Урон округляется вниз и учитывает защиту врага. Отражение не вызывает вампиризм.',
      baseCost: 65, costMultiplier: 1.55, baseValue: 0, valuePerLevel: 0.10,
      format: val => `${(val * 100).toFixed(0)}%`
    },
    lifeSteal: {
      id: 'lifeSteal', category: 'defense', name: 'Вампиризм', icon: '♥',
      description: 'Лечит от реально снятого пулями HP, без избыточного урона при добивании. Лимит лечения — 1.5% максимального HP в секунду, запас до одной секунды.',
      baseCost: 85, costMultiplier: 1.55, baseValue: 0, valuePerLevel: 0.01,
      format: val => `${(val * 100).toFixed(2)}%`
    },
    knockbackChance: {
      id: 'knockbackChance', category: 'defense', name: 'Шанс отталкивания', icon: '⇢',
      description: 'Попадание пули может оттолкнуть живого врага от ядра. Один враг отталкивается не чаще раза в 1.25 с.',
      baseCost: 60, costMultiplier: 1.30, baseValue: 0, valuePerLevel: 0.015,
      format: val => `${(val * 100).toFixed(1)}%`
    },
    knockbackPower: {
      id: 'knockbackPower', category: 'defense', name: 'Мощность отталкивания', icon: '⇢',
      description: 'Дистанция отталкивания лёгкого врага. Тяжёлых врагов отбрасывает слабее, босса — на 15% этой дистанции.',
      baseCost: 55, costMultiplier: 1.35, baseValue: 30, valuePerLevel: 5,
      requires: { id: 'knockbackChance', minLevel: 1 }, format: val => `${val.toFixed(0)} px`
    },

    // UTILITY / ECONOMY
    killCashBonus: {
      id: 'killCashBonus',
      category: 'utility',
      name: 'Бонус кредитов за уничтожение',
      description: 'Увеличивает количество кредитов за каждого уничтоженного врага.',
      icon: '🪙',
      baseCost: 40,
      costMultiplier: 1.28,
      valuePerLevel: 0.12, // +12% kill multiplier
      format: (val) => `+${((val - 1.0) * 100).toFixed(0)}%`
    },
    waveCashBonus: {
      id: 'waveCashBonus',
      category: 'utility',
      name: 'Бонус кредитов за волну',
      description: 'Увеличивает количество кредитов за завершение каждой волны.',
      icon: '💎',
      baseCost: 50,
      costMultiplier: 1.30,
      valuePerLevel: 0.15, // +15% wave multiplier
      format: (val) => `+${((val - 1.0) * 100).toFixed(0)}%`
    },
    crystalDropChance: {
      id: 'crystalDropChance', category: 'utility', name: 'Шанс микрочипа за уничтожение', icon: 'chip',
      description: 'Шанс получить 1 микрочип при уничтожении врага. Микрочипы за бой начисляются в постоянный кошелёк после победы или поражения.',
      baseCost: 75, costMultiplier: 1.25, baseValue: 0.01, valuePerLevel: 0.002,
      format: val => `${(val * 100).toFixed(1)}%`
    },
    crystalWaveBonus: {
      id: 'crystalWaveBonus', category: 'utility', name: 'Бонус микрочипов за волну', icon: 'chip',
      description: 'Увеличивает награду микрочипов за завершённую волну на 20% за уровень. Не влияет на дроп с врагов. Выплата после победы или поражения.',
      baseCost: 80, costMultiplier: 1.28, baseValue: 1, valuePerLevel: 0.20,
      format: val => `+${((val - 1) * 100).toFixed(0)}%`
    },
    freeAttackChance: {
      id: 'freeAttackChance', category: 'utility', name: 'Бесплатное улучшение атаки', icon: '+',
      valueSuffix: ' шанс за волну',
      description: 'В конце каждой волны независимый шанс бесплатно повысить случайное открытое улучшение атаки на один уровень.',
      baseCost: 85, costMultiplier: 1.35, baseValue: 0, valuePerLevel: 0.03,
      format: val => `${(val * 100).toFixed(0)}%`
    },
    freeDefenseChance: {
      id: 'freeDefenseChance', category: 'utility', name: 'Бесплатное улучшение защиты', icon: '+',
      valueSuffix: ' шанс за волну',
      description: 'В конце каждой волны независимый шанс бесплатно повысить случайное открытое улучшение защиты на один уровень.',
      baseCost: 85, costMultiplier: 1.35, baseValue: 0, valuePerLevel: 0.03,
      format: val => `${(val * 100).toFixed(0)}%`
    },
    freeEconomyChance: {
      id: 'freeEconomyChance', category: 'utility', name: 'Бесплатное улучшение экономики', icon: '+',
      valueSuffix: ' шанс за волну',
      description: 'В конце каждой волны шанс бесплатно повысить одно улучшение экономики, включая эти шансы. Не запускает дополнительные броски в той же волне.',
      baseCost: 110, costMultiplier: 1.40, baseValue: 0, valuePerLevel: 0.02,
      format: val => `${(val * 100).toFixed(0)}%`
    }
  }
};
