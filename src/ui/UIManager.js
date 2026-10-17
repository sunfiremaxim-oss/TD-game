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
      btnRestart: document.getElementById('btn-restart'),
      btnGameOverMenu: document.getElementById('btn-gameover-menu'),

      // Main menu & dialogs
      mainMenu: document.getElementById('main-menu'),
      btnMenuStart: document.getElementById('btn-menu-start'),
      btnMenuIntel: document.getElementById('btn-menu-intel'),
      btnMenuHelp: document.getElementById('btn-menu-help'),
      menuBtnSfx: document.getElementById('menu-btn-sfx'),
      menuBtnMusic: document.getElementById('menu-btn-music'),
      menuLabelSfx: document.getElementById('menu-label-sfx'),
      menuLabelMusic: document.getElementById('menu-label-music'),

      // Intel modal
      modalIntel: document.getElementById('modal-intel'),
      btnIntelClose: document.getElementById('btn-intel-close'),
      btnIntelCloseX: document.getElementById('btn-intel-close-x'),

      // Help modal
      modalHelp: document.getElementById('modal-help'),
      btnHelpClose: document.getElementById('btn-help-close'),
      btnHelpCloseX: document.getElementById('btn-help-close-x'),

      // Top nav menu button & confirm exit modal
      btnToMenu: document.getElementById('btn-to-menu'),
      modalConfirmMenu: document.getElementById('modal-confirm-menu'),
      btnConfirmResume: document.getElementById('btn-confirm-resume'),
      btnConfirmExit: document.getElementById('btn-confirm-exit')
    };

    this.enemiesAlive = 0;
    this.totalEnemies = 0;
    this._wasRegenerating = false;
    this._lastDisplayHp = null;
    this._lastMaxHp = null;
    this._lastRegenRate = null;

    this._eventsBound = false;
    this._boundKeyDown = null;
    this.intelRenderer = null;
  }

  init() {
    this._bindEvents();
    this._subscribeWorldEvents();
    this.renderUpgrades();
    this.updateHUD();
    this._updateAudioButtons();
    this._updatePauseButton();
    this.intelRenderer = new EnemyIntelRenderer();
  }

  destroy() {
    if (this._boundKeyDown) {
      window.removeEventListener('keydown', this._boundKeyDown);
      this._boundKeyDown = null;
    }
    if (this.intelRenderer) {
      this.intelRenderer.stop();
      this.intelRenderer = null;
    }
    this._eventsBound = false;
  }

  _bindEvents() {
    if (this._eventsBound) return;
    this._eventsBound = true;

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

    // Keyboard shortcuts: Escape, Space / P for pause, 1, 2, 3 for game speed
    this._boundKeyDown = (e) => this._handleKeyDown(e);
    window.addEventListener('keydown', this._boundKeyDown);

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

    // 4. Target strategy switcher
    this.dom.stratClosest?.addEventListener('click', () => this.setStrategy('closest'));
    this.dom.stratStrongest?.addEventListener('click', () => this.setStrategy('strongest'));
    this.dom.stratWeakest?.addEventListener('click', () => this.setStrategy('weakest'));

    // 5. Restart & Game Over buttons
    this.dom.btnRestart?.addEventListener('click', () => {
      this.world.eventBus.emit('RESTART_GAME');
    });
    this.dom.btnGameOverMenu?.addEventListener('click', () => {
      this.hideGameOver();
      this.world.eventBus.emit('RETURN_TO_MENU');
    });

    // 6. Main Menu Actions
    this.dom.btnMenuStart?.addEventListener('click', () => {
      this.world.eventBus.emit('START_GAME');
    });
    this.dom.btnMenuIntel?.addEventListener('click', () => this.openIntel());
    this.dom.btnIntelClose?.addEventListener('click', () => this.closeIntel());
    this.dom.btnIntelCloseX?.addEventListener('click', () => this.closeIntel());

    this.dom.btnMenuHelp?.addEventListener('click', () => this.openHelp());
    this.dom.btnHelpClose?.addEventListener('click', () => this.closeHelp());
    this.dom.btnHelpCloseX?.addEventListener('click', () => this.closeHelp());

    // Menu Audio Toggles
    this.dom.menuBtnSfx?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.audioSystem.cycleSfxVolume();
      this._updateAudioButtons();
    });
    this.dom.menuBtnMusic?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.audioSystem.cycleBgmVolume();
      this._updateAudioButtons();
    });

    // 7. Top HUD Menu Button & Confirmation Dialog
    this.dom.btnToMenu?.addEventListener('click', () => {
      this.openConfirmMenu();
    });
    this.dom.btnConfirmResume?.addEventListener('click', () => {
      this.closeConfirmMenu();
      this.togglePause();
    });
    this.dom.btnConfirmExit?.addEventListener('click', () => {
      this.closeConfirmMenu();
      this.world.eventBus.emit('RETURN_TO_MENU');
    });
  }

  setStrategy(strat) {
    const towers = this.world.getEntitiesWith(TowerComponent, TargetComponent);
    if (towers.length > 0) {
      const targetComp = this.world.getComponent(towers[0], TargetComponent);
      if (targetComp) targetComp.strategy = strat;
    }
    this.dom.stratClosest?.classList.toggle('active', strat === 'closest');
    this.dom.stratStrongest?.classList.toggle('active', strat === 'strongest');
    this.dom.stratWeakest?.classList.toggle('active', strat === 'weakest');
  }

  reset() {
    this.enemiesAlive = 0;
    this.totalEnemies = 0;
    this._wasRegenerating = false;
    this._lastDisplayHp = null;
    this._lastMaxHp = null;
    this._lastRegenRate = null;

    if (this.dom.intermissionContainer) {
      this.dom.intermissionContainer.classList.add('hidden');
    }

    this.activeTab = 'offense';
    this.switchTab('offense');
    this.setStrategy('closest');
    this.hideGameOver();
    this.closeConfirmMenu();
    this.closeIntel();
    this.closeHelp();
    this.setGameSpeed(1.0);
    this.renderUpgrades();
    this.updateHUD();
  }

  _handleKeyDown(e) {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if (e.key === 'Escape') {
      if (this.dom.modalIntel && !this.dom.modalIntel.classList.contains('hidden')) {
        this.closeIntel();
        return;
      }
      if (this.dom.modalHelp && !this.dom.modalHelp.classList.contains('hidden')) {
        this.closeHelp();
        return;
      }
      if (this.dom.modalConfirmMenu && !this.dom.modalConfirmMenu.classList.contains('hidden')) {
        this.closeConfirmMenu();
        this.togglePause();
        return;
      }
      if (!this.world.inMenu && !this.world.isGameOver) {
        this.openConfirmMenu();
        return;
      }
    }
    if (this.world.inMenu || this.world.isGameOver) return; // Ignore simulation hotkeys while in menu or game over
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
        if (data.enemyType === 'boss_shield') return;
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
    if (this.world.isGameOver || this.world.inMenu) return;
    const wasPaused = this.world.isPaused;
    this.world.gameSpeed = speed;
    this.world.isPaused = false;
    this._updatePauseButton();
    this.dom.speedBtns.forEach(btn => {
      const btnSpeed = parseFloat(btn.dataset.speed || '1');
      btn.classList.toggle('active', btnSpeed === speed);
    });
    if (wasPaused) {
      this.world.eventBus.emit('PAUSE_TOGGLED', { isPaused: false });
    }
  }

  togglePause() {
    if (this.world.isGameOver || this.world.inMenu) return;
    this.world.isPaused = !this.world.isPaused;
    this._updatePauseButton();
    this.world.eventBus.emit('PAUSE_TOGGLED', { isPaused: this.world.isPaused });
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
    if (this.dom.menuLabelSfx && this.audioSystem) {
      const info = this.audioSystem.getSfxLabel();
      this.dom.menuLabelSfx.textContent = `ЗВУКИ: ${info.text.replace('ЗВУК: ', '')}`;
      this.dom.menuBtnSfx?.classList.toggle('muted', info.isMuted);
    }

    if (this.dom.btnMusic && this.audioSystem) {
      const info = this.audioSystem.getBgmLabel();
      this.dom.btnMusic.innerHTML = `<span class="audio-icon">${info.icon}</span> <span class="audio-label">${info.text}</span>`;
      this.dom.btnMusic.title = info.title;
      this.dom.btnMusic.classList.toggle('muted', info.isMuted);
    }
    if (this.dom.menuLabelMusic && this.audioSystem) {
      const info = this.audioSystem.getBgmLabel();
      this.dom.menuLabelMusic.textContent = `МУЗЫКА: ${info.text.replace('МУЗЫКА: ', '')}`;
      this.dom.menuBtnMusic?.classList.toggle('muted', info.isMuted);
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
    if (!this.dom.upgradesList || !this.upgradeManager) return;

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

  showMainMenu() {
    document.getElementById('game-app')?.classList.add('in-menu');
    this.dom.mainMenu?.classList.remove('hidden');
    this.dom.modalGameOver?.classList.add('hidden');
    this.dom.modalConfirmMenu?.classList.add('hidden');
    this.dom.modalIntel?.classList.add('hidden');
    this.dom.modalHelp?.classList.add('hidden');
    this._updateAudioButtons();
  }

  hideMainMenu() {
    this.intelRenderer?.stop();
    document.getElementById('game-app')?.classList.remove('in-menu');
    this.dom.mainMenu?.classList.add('hidden');
    this.dom.modalIntel?.classList.add('hidden');
    this.dom.modalHelp?.classList.add('hidden');
    this.dom.modalConfirmMenu?.classList.add('hidden');
    this._updateAudioButtons();
  }

  openIntel() {
    this.dom.modalIntel?.classList.remove('hidden');
    this.intelRenderer?.start();
  }

  closeIntel() {
    this.dom.modalIntel?.classList.add('hidden');
    this.intelRenderer?.stop();
  }

  openHelp() {
    this.dom.modalHelp?.classList.remove('hidden');
  }

  closeHelp() {
    this.dom.modalHelp?.classList.add('hidden');
  }

  openConfirmMenu() {
    this.world.isPaused = true;
    this._updatePauseButton();
    this.world.eventBus.emit('PAUSE_TOGGLED', { isPaused: true });
    this.dom.modalConfirmMenu?.classList.remove('hidden');
  }

  closeConfirmMenu() {
    this.dom.modalConfirmMenu?.classList.add('hidden');
  }
}

/**
 * EnemyIntelRenderer
 * Renders real in-game neon geometries and ambient animations for the Enemy Intel Database modal.
 */
export class EnemyIntelRenderer {
  constructor() {
    this.canvases = [];
    this.animationId = null;
    this.isRunning = false;
    this._initCanvases();
  }

  _initCanvases() {
    const elements = document.querySelectorAll('.intel-canvas');
    this.canvases = Array.from(elements).map(canvas => ({
      canvas,
      ctx: canvas.getContext('2d'),
      type: canvas.dataset.enemy
    }));
    this.render(0);
  }

  start() {
    if (this.canvases.length === 0) {
      this._initCanvases();
    }
    if (this.isRunning) return;
    this.isRunning = true;
    const loop = (timestamp) => {
      if (!this.isRunning) return;
      this.render(timestamp * 0.001);
      this.animationId = requestAnimationFrame(loop);
    };
    this.animationId = requestAnimationFrame(loop);
  }

  stop() {
    this.isRunning = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  render(time) {
    for (const item of this.canvases) {
      const { ctx, type } = item;
      if (!ctx) continue;
      this._renderEnemy(ctx, type, time);
    }
  }

  _renderEnemy(ctx, type, time) {
    ctx.clearRect(0, 0, 120, 120);

    switch (type) {
      case 'scout':
        this._drawScout(ctx, time);
        break;
      case 'tank':
        this._drawTank(ctx, time);
        break;
      case 'sniper':
        this._drawSniper(ctx, time);
        break;
      case 'fighter':
        this._drawFighter(ctx, time);
        break;
      case 'aegis':
        this._drawAegis(ctx, time);
        break;
      case 'splitter':
        this._drawSplitter(ctx, time);
        break;
      case 'blinker':
        this._drawBlinker(ctx, time);
        break;
      case 'boss_architect':
        this._drawBossArchitect(ctx, time);
        break;
    }
  }

  _drawScout(ctx, time) {
    ctx.save();
    ctx.translate(60, 60);
    const bob = Math.sin(time * 2.5) * 2;
    const rock = Math.sin(time * 1.5) * 0.08;
    ctx.translate(0, bob);
    ctx.rotate(rock);

    ctx.shadowColor = '#ffe600';
    ctx.shadowBlur = 14;
    ctx.fillStyle = '#0a0d14';
    ctx.strokeStyle = '#ffe600';
    ctx.lineWidth = 3;

    // Upright neon triangle (3 sides, pointing up)
    this._drawPolygonPath(ctx, 0, 0, 24, 3, -Math.PI / 2);
    ctx.fill();
    ctx.stroke();

    // Central core accent dot
    ctx.fillStyle = '#ffe600';
    ctx.beginPath();
    ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  _drawTank(ctx, time) {
    ctx.save();
    ctx.translate(60, 60);
    const slowRot = time * 0.4;
    ctx.rotate(slowRot);

    ctx.shadowColor = '#9d00ff';
    ctx.shadowBlur = 16;
    ctx.fillStyle = '#0a0d14';
    ctx.strokeStyle = '#9d00ff';
    ctx.lineWidth = 3;

    // 6-sided heavy hexagon
    this._drawPolygonPath(ctx, 0, 0, 26, 6, 0);
    ctx.fill();
    ctx.stroke();

    // Inner geometric accent
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.lineWidth = 1.6;
    this._drawPolygonPath(ctx, 0, 0, 26 * 0.55, 6, Math.PI / 6);
    ctx.stroke();

    // Center heavy core
    ctx.fillStyle = '#9d00ff';
    ctx.shadowColor = '#9d00ff';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  _drawSniper(ctx, time) {
    ctx.save();
    ctx.translate(60, 60);

    ctx.shadowColor = '#ff7700';
    ctx.shadowBlur = 16;
    ctx.fillStyle = '#0a0d14';
    ctx.strokeStyle = '#ff7700';
    ctx.lineWidth = 3;

    // 4-sided diamond
    this._drawPolygonPath(ctx, 0, 0, 25, 4, 0);
    ctx.fill();
    ctx.stroke();

    // Optic reticle subtle crosshair
    ctx.strokeStyle = 'rgba(255, 119, 0, 0.4)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-16, 0); ctx.lineTo(16, 0);
    ctx.moveTo(0, -16); ctx.lineTo(0, 16);
    ctx.stroke();

    // Pulsating charging optic eye
    const pulse = Math.sin(time * 3.5) * 1.2;
    ctx.fillStyle = '#ff7700';
    ctx.shadowColor = '#ff7700';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(0, 0, 4.5 + pulse, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  _drawFighter(ctx, time) {
    ctx.save();
    ctx.translate(60, 60);
    const bob = Math.sin(time * 3) * 2;
    ctx.translate(0, bob);
    ctx.rotate(-Math.PI / 2); // points forward/up

    ctx.shadowColor = '#ff0055';
    ctx.shadowBlur = 16;
    ctx.fillStyle = '#0a0d14';
    ctx.strokeStyle = '#ff0055';
    ctx.lineWidth = 3;

    const r = 24;
    ctx.beginPath();
    ctx.moveTo(r * 1.3, 0);
    ctx.lineTo(-r, r * 0.9);
    ctx.lineTo(-r * 0.5, 0);
    ctx.lineTo(-r, -r * 0.9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Thruster engine flame
    const flame = 3.5 + Math.sin(time * 18) * 2;
    ctx.fillStyle = '#ffe600';
    ctx.shadowColor = '#ffe600';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(-r * 0.5, -2.5);
    ctx.lineTo(-r * 0.5 - flame, 0);
    ctx.lineTo(-r * 0.5, 2.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  _drawAegis(ctx, time) {
    // 1. Shimmering plasma dome forcefield
    const domeR = 44;
    const grad = ctx.createRadialGradient(60, 60, domeR * 0.2, 60, 60, domeR);
    grad.addColorStop(0, 'rgba(0, 229, 255, 0.02)');
    grad.addColorStop(0.7, 'rgba(0, 229, 255, 0.08)');
    grad.addColorStop(1, 'rgba(0, 229, 255, 0.22)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(60, 60, domeR, 0, Math.PI * 2);
    ctx.fill();

    // Oscillating wave perimeter
    ctx.save();
    ctx.beginPath();
    const segments = 36;
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const wave = Math.sin(a * 8 + time * 4) * 1.5;
      const px = 60 + Math.cos(a) * (domeR + wave);
      const py = 60 + Math.sin(a) * (domeR + wave);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.strokeStyle = '#00e5ff';
    ctx.shadowColor = '#00e5ff';
    ctx.shadowBlur = 10;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    // 2. Aegis Pentagon core
    ctx.save();
    ctx.translate(60, 60);

    ctx.shadowColor = '#00e5ff';
    ctx.shadowBlur = 16;
    ctx.fillStyle = '#0a0d14';
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 3;

    const r = 21;
    this._drawPolygonPath(ctx, 0, 0, r, 5, -Math.PI / 2);
    ctx.fill();
    ctx.stroke();

    // Inner concentric pentagon
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.lineWidth = 1.4;
    this._drawPolygonPath(ctx, 0, 0, r * 0.52, 5, -Math.PI / 2);
    ctx.stroke();

    ctx.fillStyle = '#00e5ff';
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  _drawSplitter(ctx, time) {
    ctx.save();
    ctx.translate(60, 60);
    const bob = Math.sin(time * 2.2) * 1.5;
    ctx.translate(0, bob);

    ctx.shadowColor = '#00ff66';
    ctx.shadowBlur = 16;
    ctx.fillStyle = '#0a0d14';
    ctx.strokeStyle = '#00ff66';
    ctx.lineWidth = 3;

    const r = 26;
    // Outer triangle
    this._drawPolygonPath(ctx, 0, 0, r, 3, -Math.PI / 2);
    ctx.fill();
    ctx.stroke();

    // Inverted inner cutout triangle to form Sierpinski fractal
    ctx.strokeStyle = 'rgba(0, 255, 102, 0.9)';
    ctx.lineWidth = 1.8;
    this._drawPolygonPath(ctx, 0, 0, r * 0.5, 3, Math.PI / 2);
    ctx.stroke();

    // Central core accent dot
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  _drawBlinker(ctx, time) {
    ctx.save();
    ctx.translate(60, 60);

    const jitter = (Math.random() < 0.08) ? (Math.random() - 0.5) * 2 : 0;
    ctx.translate(jitter, 0);
    ctx.rotate(-Math.PI / 2); // points up

    ctx.shadowColor = '#00ffff';
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#0a0d14';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.8;

    const r = 24;
    ctx.beginPath();
    ctx.moveTo(r * 1.35, 0);
    ctx.lineTo(r * 0.1, -r * 0.75);
    ctx.lineTo(r * 0.22, -r * 0.22);
    ctx.lineTo(-r * 0.8, -r * 0.85);
    ctx.lineTo(-r * 0.25, 0);
    ctx.lineTo(-r * 0.85, r * 0.8);
    ctx.lineTo(0.1, r * 0.2);
    ctx.lineTo(-0.05, r * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Energy spark core
    ctx.fillStyle = '#00ffff';
    ctx.beginPath();
    ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  _drawBossArchitect(ctx, time) {
    ctx.save();
    ctx.translate(60, 60);

    const rot = time * 0.6;
    ctx.rotate(rot);

    ctx.shadowColor = '#ff00ff';
    ctx.shadowBlur = 16;
    ctx.fillStyle = '#0a0d14';
    ctx.strokeStyle = '#ff00aa';
    ctx.lineWidth = 2.6;

    const r = 21;
    // Outer 8-point star
    this._drawStarPath(ctx, 0, 0, 8, r, r * 0.55);
    ctx.fill();
    ctx.stroke();

    // Inner counter-rotated 8-point star
    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.4;
    this._drawStarPath(ctx, 0, 0, 8, r * 0.5, r * 0.25, -rot * 2 + Math.PI / 8);
    ctx.stroke();

    // Central pulsating core
    const pulse = Math.sin(time * 3.5) * 1.5;
    ctx.fillStyle = '#ff0055';
    ctx.shadowColor = '#ff0055';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(0, 0, 5 + pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.restore(); // back to center (60, 60) without boss rotation

    // 6 Orbiting shield segments revolving around the star
    const shieldCount = 6;
    const orbitRadius = 42;
    const shieldAngle = time * 1.4;

    for (let i = 0; i < shieldCount; i++) {
      const a = shieldAngle + (i / shieldCount) * Math.PI * 2;
      const sx = 60 + Math.cos(a) * orbitRadius;
      const sy = 60 + Math.sin(a) * orbitRadius;

      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(a + Math.PI / 2);

      ctx.shadowColor = '#00f3ff';
      ctx.shadowBlur = 10;
      ctx.fillStyle = '#0a0d14';
      ctx.strokeStyle = '#00f3ff';
      ctx.lineWidth = 1.6;

      const sw = 8;
      const sh = 4;
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(-sw / 2, -sh / 2, sw, sh, 2);
      } else {
        ctx.rect(-sw / 2, -sh / 2, sw, sh);
      }
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-sw * 0.35, 0);
      ctx.lineTo(sw * 0.35, 0);
      ctx.stroke();

      ctx.restore();
    }
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

  _drawStarPath(ctx, cx, cy, points, outerR, innerR, angleOffset = 0) {
    ctx.beginPath();
    const total = points * 2;
    for (let i = 0; i < total; i++) {
      const angle = angleOffset + (i * Math.PI) / points;
      const r = i % 2 === 0 ? outerR : innerR;
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }
}
