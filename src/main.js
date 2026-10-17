/**
 * main.js
 * Game entry point, ECS bootstrap, and main animation loop.
 * Supports Main Menu state, tactical gameplay, and clean game restarts.
 */

import { World } from './core/World.js';
import { GameConfig } from './config/GameConfig.js';

// Components
import { TransformComponent } from './components/TransformComponent.js';
import { CircleColliderComponent } from './components/CircleColliderComponent.js';
import { HealthComponent } from './components/HealthComponent.js';
import { ArmorComponent } from './components/ArmorComponent.js';
import { AttackComponent } from './components/AttackComponent.js';
import { TargetComponent } from './components/TargetComponent.js';
import { RenderComponent } from './components/RenderComponent.js';
import { TowerComponent } from './components/TowerComponent.js';
import { EconomyComponent } from './components/EconomyComponent.js';
import { EnemyComponent } from './components/EnemyComponent.js';
import { ProjectileComponent } from './components/ProjectileComponent.js';

// Systems
import { MovementSystem } from './systems/MovementSystem.js?v=2.3';
import { PhysicsSeparationSystem } from './systems/PhysicsSeparationSystem.js?v=2.3';
import { TargetingSystem } from './systems/TargetingSystem.js?v=2.3';
import { SniperAISystem } from './systems/SniperAISystem.js?v=2.3';
import { WeaponSystem } from './systems/WeaponSystem.js?v=2.3';
import { CollisionSystem } from './systems/CollisionSystem.js?v=2.3';
import { DamageSystem } from './systems/DamageSystem.js?v=2.3';
import { WaveSystem } from './systems/WaveSystem.js?v=2.3';
import { EconomySystem } from './systems/EconomySystem.js?v=2.3';
import { ParticleSystem } from './systems/ParticleSystem.js?v=2.3';
import { AudioSystem } from './systems/AudioSystem.js?v=2.3';
import { RenderSystem } from './systems/RenderSystem.js?v=2.3';

// Managers & UI
import { UpgradeManager } from './managers/UpgradeManager.js?v=2.3';
import { UIManager } from './ui/UIManager.js?v=2.3';

class GameApp {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.world = null;
    this.upgradeManager = null;
    this.uiManager = null;
    this.waveSystem = null;
    this.particleSystem = null;
    this.audioSystem = null;
    this.renderSystem = null;

    this.lastTime = 0;
    this.animationFrameId = null;
    this.gameState = 'MENU'; // 'MENU' | 'PLAYING'

    this._init();
  }

  _init() {
    this.audioSystem = new AudioSystem();
    this._resizeCanvas();

    // 1. Resize and orientation handling (multi-stage delay for mobile reflow)
    window.addEventListener('resize', () => this._resizeCanvas());
    window.addEventListener('orientationchange', () => {
      this._resizeCanvas();
      setTimeout(() => this._resizeCanvas(), 100);
      setTimeout(() => this._resizeCanvas(), 300);
    });

    // Observe wrapper resizing dynamically (banners, splitscreen, Yandex UI)
    const wrapper = document.getElementById('canvas-wrapper');
    if (typeof ResizeObserver !== 'undefined' && wrapper) {
      const ro = new ResizeObserver(() => this._resizeCanvas());
      ro.observe(wrapper);
    }

    // 2. Global compliance with Yandex Games requirements:
    // Prevent browser context menu anywhere on game area
    window.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });

    // Prevent dragging images or canvas (ghost preview)
    window.addEventListener('dragstart', (e) => {
      e.preventDefault();
    });

    // Prevent text selection by drag
    window.addEventListener('selectstart', (e) => {
      if (!e.target.closest('input, textarea')) {
        e.preventDefault();
      }
    });

    // Prevent mobile swipe-to-refresh / pull-to-refresh on non-scrollable game surfaces
    document.addEventListener('touchmove', (e) => {
      if (!e.target.closest('#upgrades-list, .intel-grid, .help-scroll-body')) {
        e.preventDefault();
      }
    }, { passive: false });

    this._setupECS();
    this._startLoop();
  }

  _resizeCanvas() {
    const wrapper = document.getElementById('canvas-wrapper');
    if (!wrapper || !this.canvas) return;

    const width = wrapper.clientWidth || GameConfig.canvas.width;
    const height = wrapper.clientHeight || GameConfig.canvas.height;

    this.canvas.width = width;
    this.canvas.height = height;

    if (this.world) {
      this.world.width = width;
      this.world.height = height;

      // Keep tower centered on resize and clamp range to canvas bounds in any orientation
      const towers = this.world.getEntitiesWith(TowerComponent, TransformComponent);
      if (towers.length > 0) {
        const trans = this.world.getComponent(towers[0], TransformComponent);
        trans.x = width / 2;
        trans.y = height / 2;

        const attack = this.world.getComponent(towers[0], AttackComponent);
        if (attack && this.upgradeManager) {
          const upgradeVal = this.upgradeManager.getCurrentValue('range');
          const halfDim = Math.min(width, height) / 2;
          const maxScreenRange = Math.floor(halfDim - 20);
          attack.range = Math.min(upgradeVal, Math.max(GameConfig.tower.baseRange, maxScreenRange));
        }
      }
    }
  }

  _setupECS() {
    // 1. Create World and Managers
    this.world = new World();
    this.world.width = this.canvas.width;
    this.world.height = this.canvas.height;
    this.world.inMenu = true;

    this.upgradeManager = new UpgradeManager();
    this.particleSystem = new ParticleSystem();
    this.waveSystem = new WaveSystem();
    this.renderSystem = new RenderSystem(this.canvas, this.particleSystem);

    // 2. Register Systems in strict architectural pipeline order
    this.world.registerSystem(new MovementSystem());
    this.world.registerSystem(new PhysicsSeparationSystem());
    this.world.registerSystem(new TargetingSystem());
    this.world.registerSystem(new SniperAISystem());
    this.world.registerSystem(new WeaponSystem());
    this.world.registerSystem(new CollisionSystem());
    this.world.registerSystem(new DamageSystem());
    this.world.registerSystem(this.waveSystem);
    this.world.registerSystem(new EconomySystem());
    this.world.registerSystem(this.particleSystem);
    this.world.registerSystem(this.audioSystem);
    this.world.registerSystem(this.renderSystem);

    // 3. Create Central Tower Entity (visible in menu background)
    this._createTowerEntity();

    // 4. Initialize UI Manager
    if (this.uiManager) {
      this.uiManager.destroy();
    }
    this.uiManager = new UIManager(this.world, this.upgradeManager, this.audioSystem);
    this.uiManager.init();
    this.uiManager.showMainMenu();

    // 5. Handle lifecycle events via EventBus
    this.world.eventBus.on('START_GAME', () => {
      this.startGame();
    });

    this.world.eventBus.on('RETURN_TO_MENU', () => {
      this.returnToMenu();
    });

    this.world.eventBus.on('RESTART_GAME', () => {
      this.restartGame();
    });
  }

  startGame() {
    this.gameState = 'PLAYING';
    this.world.inMenu = false;
    this.world.isPaused = false;
    this.world.isGameOver = false;
    this.world.gameSpeed = 1.0;

    // Direct user click: unlock audio context and start music with random track from beginning
    this.audioSystem.unlockAudio();
    this.audioSystem.restartBGM();

    // Switch to gameplay layout
    this.uiManager.hideMainMenu();
    this.uiManager.setGameSpeed(1.0);
    this._resizeCanvas();

    // Begin Wave 1
    this.waveSystem.startFirstWave(this.world);
    this.uiManager.updateHUD();
  }

  returnToMenu() {
    this.gameState = 'MENU';
    this.world.inMenu = true;
    this.world.isPaused = false;
    this.world.isGameOver = false;
    this.world.gameSpeed = 1.0;

    // Purge active entities and reset systems
    this._resetWorldEntities();
    this.waveSystem.reset();
    this.particleSystem.reset();
    this.upgradeManager.reset();
    this._resetTowerStats();

    // Pause music in main menu so it starts fresh on game start
    this.audioSystem.pauseBGM();

    // Return UI to main menu
    this.uiManager.reset();
    this.uiManager.showMainMenu();
    this.uiManager.updateHUD();
    this._resizeCanvas();
  }

  restartGame() {
    this.gameState = 'PLAYING';
    this.world.inMenu = false;
    this.world.isPaused = false;
    this.world.isGameOver = false;
    this.world.gameSpeed = 1.0;

    this._resetWorldEntities();
    this.waveSystem.reset();
    this.particleSystem.reset();
    this.upgradeManager.reset();
    this._resetTowerStats();

    this.uiManager.reset();
    this.uiManager.hideMainMenu();
    this._resizeCanvas();

    // Restart random background music strictly from the beginning
    this.audioSystem.restartBGM();

    this.waveSystem.startFirstWave(this.world);
    this.uiManager.updateHUD();
  }

  _resetWorldEntities() {
    // Purge all alive enemies and boss shield segments
    const enemies = this.world.getEntitiesWith(EnemyComponent);
    for (const id of enemies) {
      this.world.destroyEntity(id);
    }
    // Purge all in-flight projectiles
    const projectiles = this.world.getEntitiesWith(ProjectileComponent);
    for (const id of projectiles) {
      this.world.destroyEntity(id);
    }
    this.world._flushDestructionQueue();
  }

  _resetTowerStats() {
    const towers = this.world.getEntitiesWith(TowerComponent);
    if (towers.length === 0) {
      this._createTowerEntity();
      return;
    }
    const towerId = towers[0];
    const towerCfg = GameConfig.tower;

    const trans = this.world.getComponent(towerId, TransformComponent);
    if (trans) {
      trans.x = this.world.width / 2;
      trans.y = this.world.height / 2;
      trans.rotation = 0;
    }

    const health = this.world.getComponent(towerId, HealthComponent);
    if (health) {
      health.max = towerCfg.baseHealth;
      health.current = towerCfg.baseHealth;
      health.regenRate = towerCfg.baseRegen;
    }

    const armor = this.world.getComponent(towerId, ArmorComponent);
    if (armor) {
      armor.percent = towerCfg.basePercentArmor;
      armor.flat = towerCfg.baseFlatArmor;
    }

    const attack = this.world.getComponent(towerId, AttackComponent);
    if (attack) {
      attack.damage = towerCfg.baseDamage;
      attack.attackSpeed = towerCfg.baseAttackSpeed;
      attack.range = towerCfg.baseRange;
      attack.cooldown = 0;
      attack.critChance = towerCfg.baseCritChance;
      attack.critMultiplier = towerCfg.baseCritMultiplier;
      attack.multishotCount = towerCfg.baseMultishotCount;
      attack.multishotChance = towerCfg.baseMultishotChance;
      attack.distanceBonus = towerCfg.baseDistanceDamageCoeff || 0.001;
    }

    const economy = this.world.getComponent(towerId, EconomyComponent);
    if (economy) {
      economy.credits = towerCfg.startCredits;
      economy.waveBonus = 1.0;
      economy.killBonus = 1.0;
    }

    const target = this.world.getComponent(towerId, TargetComponent);
    if (target) {
      target.targetEntityId = null;
      target.strategy = 'closest';
    }
  }

  _createTowerEntity() {
    const towerId = this.world.createEntity();
    const centerX = this.world.width / 2;
    const centerY = this.world.height / 2;
    const towerCfg = GameConfig.tower;

    this.world.addComponent(towerId, new TowerComponent());
    this.world.addComponent(towerId, new TransformComponent(centerX, centerY, 0));
    this.world.addComponent(towerId, new CircleColliderComponent(towerCfg.colliderRadius, 1000, true)); // isStatic: true
    this.world.addComponent(towerId, new HealthComponent(towerCfg.baseHealth, towerCfg.baseHealth, towerCfg.baseRegen));
    this.world.addComponent(towerId, new ArmorComponent(towerCfg.basePercentArmor, towerCfg.baseFlatArmor));
    this.world.addComponent(towerId, new AttackComponent(
      towerCfg.baseDamage,
      towerCfg.baseAttackSpeed,
      towerCfg.baseRange,
      0,
      towerCfg.baseCritChance,
      towerCfg.baseCritMultiplier,
      towerCfg.baseMultishotCount,
      towerCfg.baseMultishotChance,
      towerCfg.baseDistanceDamageCoeff || 0.001
    ));
    this.world.addComponent(towerId, new TargetComponent(null, 'closest'));
    this.world.addComponent(towerId, new RenderComponent(
      'tower',
      8,
      towerCfg.radius,
      GameConfig.colors.tower,
      GameConfig.colors.towerGlow,
      14
    ));
    this.world.addComponent(towerId, new EconomyComponent(towerCfg.startCredits, 1.0, 1.0));

    return towerId;
  }

  _startLoop() {
    this.lastTime = performance.now();
    this._loop = this._loop.bind(this);
    this.animationFrameId = requestAnimationFrame(this._loop);

    // Prevent accidental page back navigation during active gameplay
    try {
      history.pushState(null, '', window.location.href);
      window.addEventListener('popstate', () => {
        if (this.gameState === 'PLAYING') {
          this.uiManager?.openConfirmMenu();
          history.pushState(null, '', window.location.href);
        }
      });
    } catch (e) {}
  }

  // Yandex Games Ad / Background lifecycle hooks
  pauseForAd() {
    if (this.world) {
      this.world.isPaused = true;
      this.uiManager?._updatePauseButton();
    }
    this.audioSystem?.pauseForAd();
  }

  resumeAfterAd() {
    if (this.world && this.gameState === 'PLAYING') {
      this.world.isPaused = false;
      this.uiManager?._updatePauseButton();
    }
    this.audioSystem?.resumeAfterAd();
    this.lastTime = performance.now();
  }

  _loop(timestamp) {
    const rawDelta = (timestamp - this.lastTime) / 1000;
    this.lastTime = timestamp;

    // Strict delta time clamping to prevent physics explosions / NaN on tab changes or system lag
    const validDelta = (isFinite(rawDelta) && rawDelta >= 0) ? rawDelta : 0.016;
    const deltaTime = Math.min(0.1, validDelta);

    if (this.gameState === 'MENU') {
      // In menu state: keep background cosmos, particles, and tower core rotating smoothly
      this.renderSystem.update(this.world, deltaTime);
      this.particleSystem.update(this.world, deltaTime);
    } else {
      this.world.update(deltaTime);
      if (this.uiManager) {
        this.uiManager.update(deltaTime);
      }
    }

    this.animationFrameId = requestAnimationFrame(this._loop);
  }
}

// Global reference for Yandex Games SDK integration
window.pauseGame = () => window.gameApp?.pauseForAd();
window.resumeGame = () => window.gameApp?.resumeAfterAd();

// Instantiate safely on DOM ready or immediately if already loaded
if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', () => {
    window.gameApp = new GameApp();
  });
} else {
  window.gameApp = new GameApp();
}
