/**
 * main.js
 * Game entry point, ECS bootstrap, and main animation loop.
 * Supports Main Menu state, tactical gameplay, and clean game restarts.
 */

import { World } from './core/World.js';
import { GameConfig } from './config/GameConfig.js';

// Components
import { TransformComponent } from './components/TransformComponent.js';
import { VelocityComponent } from './components/VelocityComponent.js';
import { CircleColliderComponent } from './components/CircleColliderComponent.js';
import { HealthComponent } from './components/HealthComponent.js';
import { ArmorComponent } from './components/ArmorComponent.js';
import { DefenseComponent } from './components/DefenseComponent.js';
import { AttackComponent } from './components/AttackComponent.js';
import { TargetComponent } from './components/TargetComponent.js';
import { RenderComponent } from './components/RenderComponent.js';
import { TowerComponent } from './components/TowerComponent.js';
import { EconomyComponent } from './components/EconomyComponent.js';
import { EnemyComponent } from './components/EnemyComponent.js';
import { ProjectileComponent } from './components/ProjectileComponent.js';

// Systems
import { MovementSystem } from './systems/MovementSystem.js?v=3.04';
import { CarrierAISystem } from './systems/CarrierAISystem.js?v=3.04';
import { RailgunAISystem } from './systems/RailgunAISystem.js?v=3.04';
import { PhysicsSeparationSystem } from './systems/PhysicsSeparationSystem.js?v=3.04';
import { TargetingSystem } from './systems/TargetingSystem.js?v=3.04';
import { SniperAISystem } from './systems/SniperAISystem.js?v=3.04';
import { WeaponSystem } from './systems/WeaponSystem.js?v=3.04';
import { CollisionSystem } from './systems/CollisionSystem.js?v=3.04';
import { DamageSystem } from './systems/DamageSystem.js?v=3.04';
import { WaveSystem } from './systems/WaveSystem.js?v=3.04';
import { EconomySystem } from './systems/EconomySystem.js?v=3.04';
import { ParticleSystem } from './systems/ParticleSystem.js?v=3.04';
import { AudioSystem } from './systems/AudioSystem.js?v=3.04';
import { RenderSystem } from './systems/RenderSystem.js?v=3.04';

// Managers & UI
import { UpgradeManager } from './managers/UpgradeManager.js?v=3.04';
import { PlayerProgress } from './managers/PlayerProgress.js';
import { UIManager } from './ui/UIManager.js?v=3.04';
import { DevTools } from './ui/DevTools.js?v=3.04';

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
    window.visualViewport?.addEventListener('resize', () => this._resizeCanvas());
    document.addEventListener('visibilitychange', () => this._handleVisibilityChange());
    window.addEventListener('beforeunload', event => this._handleBeforeUnload(event));
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
      if (!e.target.closest('#upgrades-list, .intel-grid, .help-scroll-body, #volume-popover, [data-scrollable]')) {
        e.preventDefault();
      }
    }, { passive: false });

    this._setupECS();
    this._startLoop();
  }

  _handleVisibilityChange() {
    if (document.hidden && this.gameState === 'PLAYING' && this.world && !this.world.isGameOver && !this.world.isPaused) {
      this.uiManager?.togglePause();
    }
  }

  _handleBeforeUnload(event) {
    if (this.gameState !== 'PLAYING' || !this.world || this.world.isGameOver) return;
    const tower = this.world.getEntitiesWith(TowerComponent, EconomyComponent)[0];
    const economy = tower === undefined ? null : this.world.getComponent(tower, EconomyComponent);
    if (!economy || economy.crystalsSettled || economy.runCrystals <= 0) return;
    // Browsers supply their own text for this native close/reload warning.
    event.preventDefault();
    event.returnValue = '';
  }

  _resizeCanvas() {
    const wrapper = document.getElementById('canvas-wrapper');
    if (!wrapper || !this.canvas) return;

    const width = wrapper.clientWidth;
    const height = wrapper.clientHeight;
    // Hidden/transitioning containers must not teleport the world to fallback dimensions.
    if (width <= 0 || height <= 0) return;
    // Cap the backing buffer on Retina screens to keep fill cost bounded on mobile GPUs.
    const pixelRatio = Math.max(1, Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(1500000 / (width * height))));
    const bufferWidth = Math.round(width * pixelRatio);
    const bufferHeight = Math.round(height * pixelRatio);
    if (this.canvas.width !== bufferWidth) this.canvas.width = bufferWidth;
    if (this.canvas.height !== bufferHeight) this.canvas.height = bufferHeight;
    this.canvas.viewportWidth = width;
    this.canvas.viewportHeight = height;
    this.canvas.pixelRatio = pixelRatio;

    if (this.world) {
      const prevLogicalWidth = this.world.width;
      const prevLogicalHeight = this.world.height;

      if (Math.min(width, height) < 640) {
        this.world.renderScale = Math.min(width, height) / 640;
      } else {
        this.world.renderScale = 1.0;
      }
      const newLogicalWidth = width / this.world.renderScale;
      const newLogicalHeight = height / this.world.renderScale;

      this.world.width = newLogicalWidth;
      this.world.height = newLogicalHeight;

      if (prevLogicalWidth && prevLogicalHeight && prevLogicalWidth > 0 && prevLogicalHeight > 0 &&
          (prevLogicalWidth !== newLogicalWidth || prevLogicalHeight !== newLogicalHeight)) {
        const scaleX = newLogicalWidth / prevLogicalWidth;
        const scaleY = newLogicalHeight / prevLogicalHeight;

        // 1. Rescale all entity transforms proportionally to canvas changes
        const transforms = this.world.getEntitiesWith(TransformComponent);
        for (const id of transforms) {
          const trans = this.world.getComponent(id, TransformComponent);
          if (trans) {
            trans.x *= scaleX;
            trans.y *= scaleY;
          }
        }

        // 2. Rescale in-flight projectile start points & velocities
        const projectiles = this.world.getEntitiesWith(ProjectileComponent);
        for (const id of projectiles) {
          const proj = this.world.getComponent(id, ProjectileComponent);
          if (proj) {
            proj.originX *= scaleX;
            proj.originY *= scaleY;
          }
          const vel = this.world.getComponent(id, VelocityComponent);
          if (vel) {
            vel.vx *= scaleX;
            vel.vy *= scaleY;
          }
        }

        // 3. Rescale visual particle effects & damage popups
        if (this.particleSystem && typeof this.particleSystem.rescale === 'function') {
          this.particleSystem.rescale(scaleX, scaleY);
        }
      }

      // Keep tower centered on resize
      const towers = this.world.getEntitiesWith(TowerComponent, TransformComponent);
      if (towers.length > 0) {
        const trans = this.world.getComponent(towers[0], TransformComponent);
        trans.x = this.world.width / 2;
        trans.y = this.world.height / 2;

        const attack = this.world.getComponent(towers[0], AttackComponent);
        if (attack && this.upgradeManager) {
          attack.range = this.upgradeManager.getCurrentValue('range');
        }
      }
    }
  }

  _setupECS() {
    // 1. Create World and Managers
    this.world = new World();
    this.playerProgress = this.playerProgress || new PlayerProgress();
    this.world.width = this.canvas.viewportWidth || this.canvas.width;
    this.world.height = this.canvas.viewportHeight || this.canvas.height;
    this.world.inMenu = true;
    this._resizeCanvas();

    this.upgradeManager = this.playerProgress.getUpgradeManager({ permanent: false });
    this.particleSystem = new ParticleSystem();
    this.waveSystem = new WaveSystem();
    this.renderSystem = new RenderSystem(this.canvas, this.particleSystem, document.getElementById('menu-core-canvas'));

    // 2. Register Systems in strict architectural pipeline order
    this.world.registerSystem(new CarrierAISystem());
    this.world.registerSystem(new MovementSystem());
    this.world.registerSystem(new PhysicsSeparationSystem());
    this.world.registerSystem(new RailgunAISystem());
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
    this.upgradeManager.init(this.world);

    // 3. Create Central Tower Entity (visible in menu background)
    this._createTowerEntity();

    // 4. Initialize UI Manager
    if (this.uiManager) {
      this.uiManager.destroy();
    }
    this.uiManager = new UIManager(this.world, this.upgradeManager, this.audioSystem, this.playerProgress);
    this.uiManager.init();
    this.playerProgress.init(this.world);
    const syncPermanentProgress = () => {
      if (!this.world.inMenu) return;
      this.upgradeManager.setPermanentLevels(this.playerProgress.upgrades, this.playerProgress.unlockedTiers);
      this._resetTowerStats();
      this.uiManager.renderUpgrades();
      this.uiManager.updateHUD();
    };
    this.world.eventBus.on('PERMANENT_UPGRADE_PURCHASED', syncPermanentProgress);
    this.world.eventBus.on('UPGRADE_TIER_UNLOCKED', syncPermanentProgress);
    this.world.eventBus.on('PROGRESS_RESET', syncPermanentProgress);
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
    this.devTools?.destroy();
    this.devTools = GameConfig.devTools.enabled ? new DevTools(this) : null;
  }

  startGame() {
    const stage = this.uiManager.selectedStage || 1;
    if (!this.playerProgress.isStageUnlocked(stage)) return;
    this.upgradeManager.setPermanentLevels(this.playerProgress.upgrades, this.playerProgress.unlockedTiers);
    this._resetTowerStats();
    this.uiManager.renderUpgrades();
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
    this.waveSystem.startFirstWave(this.world, stage);
    this.uiManager.updateHUD();
  }

  returnToMenu() {
    this.gameState = 'MENU';
    this.world.inMenu = true;
    this.world.isPaused = false;
    this.world.isGameOver = false;
    this.world.runOutcome = null;
    this.world.stageId = null;
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
    const stage = this.world.stageId || this.uiManager.selectedStage || 1;
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

    this.waveSystem.startFirstWave(this.world, stage);
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
      armor.percentReduction = towerCfg.basePercentArmor;
      armor.flatReduction = towerCfg.baseFlatArmor;
    }

    const attack = this.world.getComponent(towerId, AttackComponent);
    if (attack) {
      attack.damage = towerCfg.baseDamage;
      attack.attackSpeed = towerCfg.baseAttackSpeed;
      attack.range = towerCfg.baseRange;
      attack.cooldown = 0;
      attack.aimHoldRemaining = 0;
      attack.critChance = towerCfg.baseCritChance;
      attack.critMultiplier = towerCfg.baseCritMultiplier;
      attack.multishotCount = towerCfg.baseMultishotCount;
      attack.multishotChance = towerCfg.baseMultishotChance;
      attack.distanceBonus = towerCfg.baseDistanceDamageCoeff || 0;
      attack.rapidFireRemaining = 0;
    }

    const economy = this.world.getComponent(towerId, EconomyComponent);
    if (economy) {
      economy.credits = towerCfg.startCredits;
      economy.killMultiplier = 1.0;
      economy.waveMultiplier = 1.0;
      economy.runCrystals = 0;
      economy.lastCrystalRewardWave = 0;
      economy.crystalsSettled = false;
    }

    const target = this.world.getComponent(towerId, TargetComponent);
    if (target) {
      target.targetEntityId = null;
    }
    this.world.addComponent(towerId, new DefenseComponent());
    this.upgradeManager.applyAll(this.world, towerId);
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
    this.world.addComponent(towerId, new DefenseComponent());
    this.world.addComponent(towerId, new AttackComponent(
      towerCfg.baseDamage,
      towerCfg.baseAttackSpeed,
      towerCfg.baseRange,
      0,
      towerCfg.baseCritChance,
      towerCfg.baseCritMultiplier,
      towerCfg.baseMultishotCount,
      towerCfg.baseMultishotChance,
      towerCfg.baseDistanceDamageCoeff || 0
    ));
    this.world.addComponent(towerId, new TargetComponent());
    this.world.addComponent(towerId, new RenderComponent(
      'tower',
      8,
      towerCfg.radius,
      GameConfig.colors.tower,
      GameConfig.colors.towerGlow,
      14
    ));
    this.world.addComponent(towerId, new EconomyComponent(towerCfg.startCredits, 1.0, 1.0));
    this.upgradeManager.applyAll(this.world, towerId);

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
    if (this.world && this.gameState === 'PLAYING' && !this.world.isGameOver) {
      this.world.isPaused = false;
      this.uiManager?._updatePauseButton();
    }
    this.audioSystem?.resumeAfterAd();
    this.lastTime = performance.now();
  }

  _loop(timestamp) {
    const rawDelta = (timestamp - this.lastTime) / 1000;
    this.lastTime = timestamp;
    this.uiManager?.updateFps(timestamp);
    this.devTools?.update(timestamp);

    // Strict delta time clamping to prevent physics explosions / NaN on tab changes or system lag
    const validDelta = (isFinite(rawDelta) && rawDelta >= 0) ? rawDelta : 0.016;
    const deltaTime = Math.min(0.1, validDelta);

    if (this.gameState === 'MENU') {
      // In menu state: keep background cosmos, particles, and the reactor pulse animated.
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
