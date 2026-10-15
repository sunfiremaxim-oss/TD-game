/**
 * GameConfig.js
 * Central configuration for constants, enemy archetypes, visual styles, and upgrades.
 */

export const GameConfig = {
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
    baseHealth: 600,
    baseRegen: 1.0,
    baseDamage: 25,
    baseAttackSpeed: 1.6, // attacks per second
    baseRange: 130,       // Initial attack zone 2x smaller (130px)
    baseCritChance: 0.08,
    baseCritMultiplier: 1.6,
    baseMultishotCount: 1,
    baseMultishotChance: 0.0,
    basePercentArmor: 0.0,
    baseFlatArmor: 0,
    baseDistanceDamageCoeff: 0.001, // +0.1% damage per unit traveled
    startCredits: 100
  },

  // Enemy archetypes
  enemies: {
    scout: {
      type: 'scout',
      sides: 3,             // Triangle
      radius: 12,
      baseSpeed: 105,
      mass: 1.0,
      baseHp: 40,
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
      baseSpeed: 155,       // Fast
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
      baseSpeed: 52,        // Slow
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
      baseSpeed: 80,
      mass: 1.5,
      baseHp: 75,
      baseDamage: 22,
      baseReward: 25,
      stopDistance: 240,    // Scaled for tighter base perimeter
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
      baseSpeed: 48,        // Slow fortress
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
      baseSpeed: 82,
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
      baseSpeed: 185,       // Fast sprint to tower
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
      baseSpeed: 95,
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

    // 4. Системный Босс: Архитектор (Boss: The Architect) - Giant star fractal with rotating shields
    boss_architect: {
      type: 'boss_architect',
      sides: 8,             // Star fractal
      radius: 38,
      baseSpeed: 30,        // Imposing slow march
      mass: 30.0,
      baseHp: 1600,         // Scaled heavily by wave
      baseDamage: 65,       // High contact damage
      baseReward: 350,
      color: '#ff00aa',
      glowColor: '#ff00ff',
      glowBlur: 22,
      shieldCount: 6,
      shieldOrbitRadius: 78,
      shieldOrbitSpeed: 1.2
    },
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
    waveBaseReward: 50,
    waveRewardGrowth: 25
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

  // 12 Upgrades configuration
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
      format: (val) => `${val.toFixed(2)} /сек`
    },
    range: {
      id: 'range',
      category: 'offense',
      name: 'Расширение зоны атаки',
      icon: '📡',
      baseCost: 30,
      costMultiplier: 1.25,
      valuePerLevel: 8, // +8px radius per level (reduced from 20px)
      maxLevel: 20, // max 290px (prevents zone from spilling off-screen)
      format: (val) => `${val.toFixed(0)} px`
    },
    distanceDamage: {
      id: 'distanceDamage',
      category: 'offense',
      name: 'Урон за дальность',
      icon: '🎯',
      baseCost: 35,
      costMultiplier: 1.28,
      valuePerLevel: 0.0005, // +0.0005 per unit per level
      format: (val) => `+${(val * 100).toFixed(2)}%/100ед.`
    },
    critChance: {
      id: 'critChance',
      category: 'offense',
      name: 'Шанс крита',
      icon: '🎯',
      baseCost: 40,
      costMultiplier: 1.32,
      valuePerLevel: 0.02, // +2%
      maxLevel: 36, // up to 80%
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
      valuePerLevel: 0.015, // +1.5% per level (reduced from 5%)
      maxLevel: 25, // up to 37.5%
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
      maxLevel: 5,
      format: (val) => `+${val} цели`
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
      maxLevel: 28, // soft cap around 85%
      format: (val) => `${Math.min(85, val * 100).toFixed(0)}%`
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
      format: (val) => `+${val.toFixed(1)}/сек`
    },

    // UTILITY / ECONOMY
    killCashBonus: {
      id: 'killCashBonus',
      category: 'utility',
      name: 'Бонус за убийства',
      icon: '🪙',
      baseCost: 40,
      costMultiplier: 1.28,
      valuePerLevel: 0.12, // +12% kill multiplier
      format: (val) => `+${((val - 1.0) * 100).toFixed(0)}%`
    },
    waveCashBonus: {
      id: 'waveCashBonus',
      category: 'utility',
      name: 'Бонус за волну',
      icon: '💎',
      baseCost: 50,
      costMultiplier: 1.30,
      valuePerLevel: 0.15, // +15% wave multiplier
      format: (val) => `+${((val - 1.0) * 100).toFixed(0)}%`
    }
  }
};
