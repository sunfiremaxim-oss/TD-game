/**
 * main.js
 * Game entry point, ECS bootstrap, and main animation loop.
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

// Systems
import { MovementSystem } from './systems/MovementSystem.js?v=2.2';
import { PhysicsSeparationSystem } from './systems/PhysicsSeparationSystem.js?v=2.2';
import { TargetingSystem } from './systems/TargetingSystem.js?v=2.2';
import { SniperAISystem } from './systems/SniperAISystem.js?v=2.2';
import { WeaponSystem } from './systems/WeaponSystem.js?v=2.2';
import { CollisionSystem } from './systems/CollisionSystem.js?v=2.2';
import { DamageSystem } from './systems/DamageSystem.js?v=2.2';
import { WaveSystem } from './systems/WaveSystem.js?v=2.2';
import { EconomySystem } from './systems/EconomySystem.js?v=2.2';
import { ParticleSystem } from './systems/ParticleSystem.js?v=2.2';
import { AudioSystem } from './systems/AudioSystem.js?v=2.2';
import { RenderSystem } from './systems/RenderSystem.js?v=2.2';

// Managers & UI
import { UpgradeManager } from './managers/UpgradeManager.js?v=2.2';
import { UIManager } from './ui/UIManager.js?v=2.2';

class GameApp {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.world = null;
    this.upgradeManager = null;
    this.uiManager = null;
    this.waveSystem = null;
    this.particleSystem = null;
    this.audioSystem = null;

    this.lastTime = 0;
    this.animationFrameId = null;

    this._init();
  }

  _init() {
    this.audioSystem = new AudioSystem();
    this._resizeCanvas();
    window.addEventListener('resize', () => this._resizeCanvas());
    this._startNewGame();
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

      // Keep tower centered on resize and clamp range to canvas bounds
      const towers = this.world.getEntitiesWith(TowerComponent, TransformComponent);
      if (towers.length > 0) {
        const trans = this.world.getComponent(towers[0], TransformComponent);
        trans.x = width / 2;
        trans.y = height / 2;

        const attack = this.world.getComponent(towers[0], AttackComponent);
        if (attack && this.upgradeManager) {
          const upgradeVal = this.upgradeManager.getCurrentValue('range');
          const maxScreenRange = Math.floor((height / 2) - 20);
          attack.range = Math.min(upgradeVal, Math.max(GameConfig.tower.baseRange, maxScreenRange));
        }
      }
    }
  }

  _startNewGame() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }

    // 1. Create World and Managers
    this.world = new World();
    this.world.width = this.canvas.width;
    this.world.height = this.canvas.height;

    this.upgradeManager = new UpgradeManager();
    this.particleSystem = new ParticleSystem();
    this.waveSystem = new WaveSystem();

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
    this.world.registerSystem(new RenderSystem(this.canvas, this.particleSystem));

    // 3. Create Central Tower Entity
    this._createTowerEntity();

    // 4. Initialize UI Manager
    this.uiManager = new UIManager(this.world, this.upgradeManager, this.audioSystem);
    this.uiManager.init();
    this.uiManager.hideGameOver();

    // 5. Start Wave 1 immediately with UI subscribed
    this.waveSystem.startFirstWave(this.world);

    // 6. Handle game restart events
    this.world.eventBus.on('RESTART_GAME', () => {
      this._startNewGame();
    });

    // 7. Start game loop
    this.lastTime = performance.now();
    this._loop = this._loop.bind(this);
    this.animationFrameId = requestAnimationFrame(this._loop);
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

  _loop(timestamp) {
    const rawDelta = (timestamp - this.lastTime) / 1000;
    this.lastTime = timestamp;

    // Clamp delta time to prevent simulation spikes during tab changes
    const deltaTime = Math.min(0.1, rawDelta);

    this.world.update(deltaTime);
    if (this.uiManager) {
      this.uiManager.update(deltaTime);
    }

    this.animationFrameId = requestAnimationFrame(this._loop);
  }
}

// Instantiate safely on DOM ready or immediately if already loaded
if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', () => {
    window.gameApp = new GameApp();
  });
} else {
  window.gameApp = new GameApp();
}
