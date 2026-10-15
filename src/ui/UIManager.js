/**
 * UIManager.js
 * Strictly isolated DOM UI manager.
 * Handles HUD panels, upgrade tabs, target strategy selectors, game speed, and modals.
 */

import { TowerComponent } from '../components/TowerComponent.js';
import { TargetComponent } from '../components/TargetComponent.js';
import { HealthComponent } from '../components/HealthComponent.js';
import { EconomyComponent } from '../components/EconomyComponent.js';

export class UIManager {
  constructor(world, upgradeManager, audioSystem) {
    this.world = world;
    this.upgradeManager = upgradeManager;
    this.audioSystem = audioSystem;

    this.activeTab = 'offense'; // 'offense' | 'defense' | 'utility'

    // DOM references
    this.dom = {
      waveText: document.getElementById('hud-wave'),
      enemyText: document.getElementById('hud-enemies'),
      creditsText: document.getElementById('hud-credits'),
      hpBarFill: document.getElementById('hud-hp-fill'),
      hpText: document.getElementById('hud-hp-text'),
      
      // Intermission countdown bar
      intermissionContainer: document.getElementById('intermission-container'),
      intermissionBar: document.getElementById('intermission-bar'),
      intermissionText: document.getElementById('intermission-text'),

      // Controls
      btnPause: document.getElementById('btn-pause'),
      speedBtns: [
        document.getElementById('btn-speed-1') || document.getElementById('btn-speed'),
        document.getElementById('btn-speed-2'),
        document.getElementById('btn-speed-3')
      ].filter(Boolean),
      btnSfx: document.getElementById('btn-sound-sfx'),
      btnMusic: document.getElementById('btn-sound-music'),

      // Strategy buttons
      stratClosest: document.getElementById('strat-closest'),
      stratStrongest: document.getElementById('strat-strongest'),
      stratWeakest: document.getElementById('strat-weakest'),

      // Upgrade tabs and list
      tabOffense: document.getElementById('tab-offense'),
      tabDefense: document.getElementById('tab-defense'),
      tabUtility: document.getElementById('tab-utility'),
      upgradesList: document.getElementById('upgrades-list'),

      // Game over modal
      modalGameOver: document.getElementById('modal-gameover'),
      finalWaveText: document.getElementById('modal-final-wave'),
      btnRestart: document.getElementById('btn-restart')
    };

    this.enemiesAlive = 0;
    this.totalEnemies = 0;
    this._wasRegenerating = false;
    this._lastDisplayHp = null;
    this._lastMaxHp = null;
    this._lastRegenRate = null;
  }

  init() {
    this._bindEvents();
    this._subscribeWorldEvents();
    this.renderUpgrades();
    this.updateHUD();
    this._updateAudioButtons();
    this._updatePauseButton();
  }

  _bindEvents() {
    // 1. Tabs
    this.dom.tabOffense?.addEventListener('click', () => this.switchTab('offense'));
    this.dom.tabDefense?.addEventListener('click', () => this.switchTab('defense'));
    this.dom.tabUtility?.addEventListener('click', () => this.switchTab('utility'));

    // 2. Pause & Speed controls
    this.dom.btnPause?.addEventListener('click', () => {
      this.togglePause();
    });

    this.dom.speedBtns.forEach((btn, index) => {
      const speed = parseFloat(btn.dataset.speed || (index + 1));
      btn.addEventListener('click', () => {
        this.setGameSpeed(speed);
      });
    });

    // Keyboard shortcuts: Space / P for pause, 1, 2, 3 for game speed
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (e.code === 'Space' || e.key === ' ' || e.key === 'p' || e.key === 'P' || e.key === 'з' || e.key === 'З') {
        e.preventDefault();
        this.togglePause();
      } else if (e.key === '1') {
        this.setGameSpeed(1.0);
      } else if (e.key === '2') {
        this.setGameSpeed(2.0);
      } else if (e.key === '3') {
        this.setGameSpeed(3.0);
      }
    });

    // 3. Dual Audio Controls (SFX & BGM)
    // SFX button: click = cycle volume, right-click = toggle mute
    this.dom.btnSfx?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.audioSystem.cycleSfxVolume();
      this._updateAudioButtons();
    });
    this.dom.btnSfx?.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.audioSystem.toggleSfxMute();
      this._updateAudioButtons();
    });

    // Music button: click = cycle volume, right-click = toggle mute
    this.dom.btnMusic?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.audioSystem.cycleBgmVolume();
      this._updateAudioButtons();
    });
    this.dom.btnMusic?.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.audioSystem.toggleBgmMute();
      this._updateAudioButtons();
    });

    // Autoplay unlock banner click
    this.dom.audioUnlockBanner?.addEventListener('click', () => {
      this.audioSystem.unlockAudio();
      this.dom.audioUnlockBanner.classList.add('hidden');
    });

    // 4. Target strategy switcher
    const setStrategy = (strat) => {
      const towers = this.world.getEntitiesWith(TowerComponent, TargetComponent);
      if (towers.length > 0) {
        const targetComp = this.world.getComponent(towers[0], TargetComponent);
        if (targetComp) targetComp.strategy = strat;
      }
      this.dom.stratClosest?.classList.toggle('active', strat === 'closest');
      this.dom.stratStrongest?.classList.toggle('active', strat === 'strongest');
      this.dom.stratWeakest?.classList.toggle('active', strat === 'weakest');
    };

    this.dom.stratClosest?.addEventListener('click', () => setStrategy('closest'));
    this.dom.stratStrongest?.addEventListener('click', () => setStrategy('strongest'));
    this.dom.stratWeakest?.addEventListener('click', () => setStrategy('weakest'));

    // 5. Restart button
    this.dom.btnRestart?.addEventListener('click', () => {
      this.world.eventBus.emit('RESTART_GAME');
    });
  }

  _subscribeWorldEvents() {
    // Intermission ticks
    this.world.eventBus.on('INTERMISSION_TICK', (data) => {
      if (this.dom.intermissionContainer) {
        this.dom.intermissionContainer.classList.remove('hidden');
      }
      if (this.dom.intermissionBar) {
        this.dom.intermissionBar.style.width = `${(data.progress * 100).toFixed(1)}%`;
      }
      if (this.dom.intermissionText) {
        const isBoss = data.nextWave % 10 === 0;
        this.dom.intermissionText.textContent = isBoss
          ? `ПЕРЕРЫВ: ${data.remaining.toFixed(1)}s (ВОЛНА ${data.nextWave} [БОСС])`
          : `ПЕРЕРЫВ: ${data.remaining.toFixed(1)}s (ВОЛНА ${data.nextWave})`;
      }
    });

    this.world.eventBus.on('WAVE_STARTED', (data) => {
      if (this.dom.intermissionContainer) {
        this.dom.intermissionContainer.classList.add('hidden');
      }
      if (this.dom.waveText) {
        const isBoss = data.wave % 10 === 0;
        this.dom.waveText.textContent = isBoss
          ? `ВОЛНА ${String(data.wave).padStart(2, '0')} [БОСС]`
          : `ВОЛНА ${String(data.wave).padStart(2, '0')}`;
        this.dom.waveText.style.color = isBoss ? '#ff0055' : '';
        this.dom.waveText.style.textShadow = isBoss ? '0 0 14px #ff0055' : '';
      }
      this.totalEnemies = data.totalEnemies;
      this.enemiesAlive = data.totalEnemies;
      this._updateEnemiesCount();
    });

    this.world.eventBus.on('WAVE_PROGRESS', (data) => {
      this.enemiesAlive = (data.total - data.spawned) + data.alive;
      this._updateEnemiesCount();
    });

    this.world.eventBus.on('ENTITY_DIED', (data) => {
      if (data.isEnemy) {
        this.enemiesAlive = Math.max(0, this.enemiesAlive - 1);
        this._updateEnemiesCount();
      }
    });

    this.world.eventBus.on('CREDITS_CHANGED', (data) => {
      if (this.dom.creditsText) {
        this.dom.creditsText.textContent = `${data.credits.toLocaleString()} ◈`;
        this.dom.creditsText.classList.remove('pulse');
        void this.dom.creditsText.offsetWidth; // trigger reflow
        this.dom.creditsText.classList.add('pulse');
      }
      this.renderUpgrades();
    });

    this.world.eventBus.on('UPGRADE_PURCHASED', () => {
      this.renderUpgrades();
      this.updateHUD();
    });

    this.world.eventBus.on('TOWER_DAMAGED', () => {
      this.updateHUD();
    });

    this.world.eventBus.on('GAME_OVER', () => {
      this.world.isPaused = true;
      this._updatePauseButton();
      if (this.dom.modalGameOver) {
        this.dom.modalGameOver.classList.remove('hidden');
      }
      if (this.dom.finalWaveText && this.dom.waveText) {
        this.dom.finalWaveText.textContent = this.dom.waveText.textContent;
      }
    });

    this.world.eventBus.on('AUDIO_UNLOCKED', () => {
      this._updateAudioButtons();
    });
  }

  _updateEnemiesCount() {
    if (this.dom.enemyText) {
      this.dom.enemyText.textContent = `ВРАГИ: ${this.enemiesAlive}`;
    }
  }

  switchTab(tabName) {
    this.activeTab = tabName;
    this.dom.tabOffense?.classList.toggle('active', tabName === 'offense');
    this.dom.tabDefense?.classList.toggle('active', tabName === 'defense');
    this.dom.tabUtility?.classList.toggle('active', tabName === 'utility');
    this.renderUpgrades();
  }

  setGameSpeed(speed) {
    if (this.world.isGameOver) return;
    this.world.gameSpeed = speed;
    this.world.isPaused = false;
    this._updatePauseButton();
    this.dom.speedBtns.forEach(btn => {
      const btnSpeed = parseFloat(btn.dataset.speed || '1');
      btn.classList.toggle('active', btnSpeed === speed);
    });
  }

  togglePause() {
    if (this.world.isGameOver) return;
    this.world.isPaused = !this.world.isPaused;
    this._updatePauseButton();
  }

  _updatePauseButton() {
    if (!this.dom.btnPause) return;
    const isPaused = !!this.world.isPaused;
    this.dom.btnPause.classList.toggle('active', isPaused);
    this.dom.btnPause.title = isPaused ? 'Продолжить игру (Пробел / P)' : 'Пауза (Пробел / P)';
    this.dom.btnPause.textContent = isPaused ? '▶' : '⏸';
  }

  _updateAudioButtons() {
    if (this.dom.btnSfx && this.audioSystem) {
      const info = this.audioSystem.getSfxLabel();
      this.dom.btnSfx.innerHTML = `<span class="audio-icon">${info.icon}</span> <span class="audio-label">${info.text}</span>`;
      this.dom.btnSfx.title = info.title;
      this.dom.btnSfx.classList.toggle('muted', info.isMuted);
    }
    if (this.dom.btnMusic && this.audioSystem) {
      const info = this.audioSystem.getBgmLabel();
      this.dom.btnMusic.innerHTML = `<span class="audio-icon">${info.icon}</span> <span class="audio-label">${info.text}</span>`;
      this.dom.btnMusic.title = info.title;
      this.dom.btnMusic.classList.toggle('muted', info.isMuted);
    }
  }

  /**
   * Frame-by-frame UI update for continuous metrics (like passive health regeneration).
   */
  update(deltaTime) {
    const towers = this.world.getEntitiesWith(TowerComponent, HealthComponent);
    if (towers.length === 0) return;

    const health = this.world.getComponent(towers[0], HealthComponent);
    if (!health) return;

    // Continuously sync HUD while health is actively regenerating
    if (health.current > 0 && health.current < health.max && health.regenRate > 0) {
      this._updateHealthHUD(health);
      this._wasRegenerating = true;
    } else if (this._wasRegenerating) {
      // Clamped back to full health: do clean final update
      this._updateHealthHUD(health);
      this._wasRegenerating = false;
    }
  }

  _updateHealthHUD(health) {
    if (!health) return;

    const pct = Math.max(0, Math.min(100, (health.current / health.max) * 100));
    const pctStr = `${pct.toFixed(1)}%`;
    if (this.dom.hpBarFill && this.dom.hpBarFill.style.width !== pctStr) {
      this.dom.hpBarFill.style.width = pctStr;
    }

    const displayCurrent = Math.min(health.max, Math.ceil(health.current));
    if (this.dom.hpText && (this._lastDisplayHp !== displayCurrent || this._lastMaxHp !== health.max || this._lastRegenRate !== health.regenRate)) {
      this._lastDisplayHp = displayCurrent;
      this._lastMaxHp = health.max;
      this._lastRegenRate = health.regenRate;
      const regenText = health.regenRate > 0 ? ` (+${health.regenRate.toFixed(1)}/с)` : '';
      this.dom.hpText.innerHTML = `<span style="color:#94a3b8; font-weight:700;">HP:</span> <strong>${displayCurrent}</strong> / ${health.max}${regenText ? `<span style="color:#00ff88; font-weight:800;">${regenText}</span>` : ''}`;
    }
  }

  updateHUD() {
    const towers = this.world.getEntitiesWith(TowerComponent, HealthComponent, EconomyComponent);
    if (towers.length === 0) return;

    const towerId = towers[0];
    const health = this.world.getComponent(towerId, HealthComponent);
    const economy = this.world.getComponent(towerId, EconomyComponent);

    if (health) {
      this._updateHealthHUD(health);
    }

    if (economy && this.dom.creditsText) {
      this.dom.creditsText.textContent = `${economy.credits.toLocaleString()} ◈`;
    }
  }

  renderUpgrades() {
    if (!this.dom.upgradesList) return;

    const towers = this.world.getEntitiesWith(TowerComponent, EconomyComponent);
    const currentCredits = towers.length > 0 ? this.world.getComponent(towers[0], EconomyComponent).credits : 0;

    const allUpgrades = this.upgradeManager.getAllUpgrades();
    const filtered = allUpgrades.filter(u => u.category === this.activeTab);

    this.dom.upgradesList.innerHTML = '';

    for (const u of filtered) {
      const isMax = u.maxLevel && u.level >= u.maxLevel;
      const canAfford = !isMax && currentCredits >= u.cost;

      const card = document.createElement('div');
      card.className = `upgrade-card ${isMax ? 'maxed' : ''}`;

      const formattedCurrent = u.format(u.currentVal);
      const formattedNext = isMax ? 'MAX' : u.format(u.nextVal);

      card.innerHTML = `
        <div class="upgrade-header">
          <span class="upgrade-title">${u.icon} ${u.name}</span>
          <span class="upgrade-lvl">УР. ${u.level}${u.maxLevel ? `/${u.maxLevel}` : ''}</span>
        </div>
        <div class="upgrade-stats">
          <span class="stat-current">${formattedCurrent}</span>
          <span class="stat-arrow">➔</span>
          <span class="stat-next">${formattedNext}</span>
        </div>
        <button class="upgrade-buy-btn ${!canAfford ? 'disabled' : ''}" ${!canAfford ? 'disabled' : ''}>
          ${isMax ? 'МАКСИМУМ' : `КУПИТЬ: ${u.cost.toLocaleString()} ◈`}
        </button>
      `;

      const buyBtn = card.querySelector('.upgrade-buy-btn');
      if (buyBtn && !isMax) {
        buyBtn.addEventListener('click', () => {
          this.upgradeManager.buyUpgrade(u.id, this.world);
        });
      }

      this.dom.upgradesList.appendChild(card);
    }
  }

  hideGameOver() {
    if (this.dom.modalGameOver) {
      this.dom.modalGameOver.classList.add('hidden');
    }
    this._updatePauseButton();
  }
}
