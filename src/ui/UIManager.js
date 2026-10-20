/**
 * UIManager.js
 * Strictly isolated DOM UI manager.
 * Handles HUD panels, upgrade tabs, game speed, and modals.
 */

import { TowerComponent } from '../components/TowerComponent.js';
import { HealthComponent } from '../components/HealthComponent.js';
import { EconomyComponent } from '../components/EconomyComponent.js';
import { getHealthRatio, getHealthColor } from '../visuals/HealthVisuals.js';

// Each inner array is one logical row, independent of config declaration order.
export const UPGRADE_LAYOUT = {
  offense: [['damage', 'attackSpeed'], ['critChance', 'critDamage'], ['multishotChance', 'multishotTargets'],
    ['ricochetChance', 'ricochetCount'], ['rapidFireChance', 'rapidFireDuration'], ['range']],
  defense: [['maxHealth', 'healthRegen'], ['armorPercent', 'flatArmor'],
    ['damageReflection', 'lifeSteal'], ['knockbackChance', 'knockbackPower']],
  utility: [['killCashBonus', 'waveCashBonus'], ['freeAttackChance'], ['freeDefenseChance'], ['freeEconomyChance']]
};
const UPGRADE_LABELS = {
  damage: 'Урон', attackSpeed: 'Скорость атаки', critChance: 'Шанс крит. атаки', critDamage: 'Крит. урон',
  multishotChance: 'Мультивыстрел', multishotTargets: 'Доп. цели', range: 'Дальность атаки',
  maxHealth: 'Прочность', healthRegen: 'Регенерация', armorPercent: 'Броня, %', flatArmor: 'Поглощение',
  ricochetChance: 'Шанс рикошета', ricochetCount: 'Рикошетов',
  rapidFireChance: 'Быстрая атака', rapidFireDuration: 'Длительность',
  damageReflection: 'Отражение', lifeSteal: 'Вампиризм',
  knockbackChance: 'Отталкивание'
};
const GAME_SPEEDS = [1, 2, 3];

export class UIManager {
  constructor(world, upgradeManager, audioSystem) {
    this.world = world;
    this.upgradeManager = upgradeManager;
    this.audioSystem = audioSystem;

    this.activeTab = 'offense'; // 'offense' | 'defense' | 'utility'
    this.upgradeCardsMap = new Map();
    this.fpsEnabled = false;
    this._resetFpsSample();
    this._boundFpsVisibility = () => this._resetFpsSample();

    // DOM references
    this.dom = {
      waveText: document.getElementById('hud-wave'),
      waveBarFill: document.getElementById('hud-wave-fill'),
      sidebar: document.getElementById('sidebar'),
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
      speedValue: document.getElementById('game-speed-value'),
      btnSpeedDown: document.getElementById('btn-speed-down'),
      btnSpeedUp: document.getElementById('btn-speed-up'),
      btnFps: document.getElementById('btn-fps'),
      fpsCounter: document.getElementById('fps-counter'),
      btnSfx: document.getElementById('btn-sound-sfx'),
      btnMusic: document.getElementById('btn-sound-music'),
      volumePopover: document.getElementById('volume-popover'),
      volumeLabel: document.getElementById('volume-label'),
      volumeSlider: document.getElementById('volume-slider'),
      volumeValue: document.getElementById('volume-value'),
      volumeMute: document.getElementById('volume-mute'),

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

      // Unified pause menu
      btnToMenu: document.getElementById('btn-to-menu'),
      modalBattleMenu: document.getElementById('modal-battle-menu'),
      btnBattleResume: document.getElementById('btn-battle-resume'),
      btnBattleRestart: document.getElementById('btn-battle-restart'),
      btnBattleExit: document.getElementById('btn-battle-exit')
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
    this.closeVolumePopover();
    document.removeEventListener('pointerdown', this._boundVolumeOutside);
    window.removeEventListener('resize', this._boundVolumeResize);
    document.removeEventListener('visibilitychange', this._boundFpsVisibility);
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
    this.dom.btnFps?.addEventListener('click', () => this.toggleFps());
    document.addEventListener('visibilitychange', this._boundFpsVisibility);

    this.dom.btnSpeedDown?.addEventListener('click', () => this.stepGameSpeed(-1));
    this.dom.btnSpeedUp?.addEventListener('click', () => this.stepGameSpeed(1));

    // 1. Tabs
    this.dom.tabOffense?.addEventListener('click', () => this.switchTab('offense'));
    this.dom.tabDefense?.addEventListener('click', () => this.switchTab('defense'));
    this.dom.tabUtility?.addEventListener('click', () => this.switchTab('utility'));

    // 2. Pause & Speed controls
    this.dom.btnPause?.addEventListener('click', () => {
      this.togglePause();
    });

    // Keyboard shortcuts: Escape, Space / P for pause, 1, 2, 3 for game speed
    this._boundKeyDown = (e) => this._handleKeyDown(e);
    window.addEventListener('keydown', this._boundKeyDown);

    this._bindAudioControls();

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

    // 7. Pause menu: settings stay available while the simulation is stopped.
    this.dom.btnToMenu?.addEventListener('click', () => this.openBattleMenu());
    this.dom.btnBattleResume?.addEventListener('click', () => this.resumeBattle());
    this.dom.btnBattleRestart?.addEventListener('click', () => {
      this.closeBattleMenu();
      this.world.eventBus.emit('RESTART_GAME');
    });
    this.dom.btnBattleExit?.addEventListener('click', () => {
      this.closeBattleMenu();
      this.world.eventBus.emit('RETURN_TO_MENU');
    });
  }

  _resetFpsSample() {
    this._fpsLastTime = null;
    this._fpsElapsed = 0;
    this._fpsFrames = 0;
  }

  toggleFps() {
    this.fpsEnabled = !this.fpsEnabled;
    this._resetFpsSample();
    this.dom.btnFps?.setAttribute('aria-pressed', String(this.fpsEnabled));
    if (this.dom.btnFps) {
      this.dom.btnFps.title = this.fpsEnabled ? 'Скрыть счётчик FPS' : 'Показать счётчик FPS';
    }
    if (this.dom.fpsCounter) {
      this.dom.fpsCounter.hidden = !this.fpsEnabled;
      this.dom.fpsCounter.textContent = '— FPS · — мс';
    }
  }

  // Real requestAnimationFrame timestamps, independent of simulation speed and dt clamping.
  updateFps(timestamp) {
    if (!this.fpsEnabled) return;
    if (document.hidden) {
      this._resetFpsSample();
      return;
    }
    if (this._fpsLastTime !== null) {
      const elapsed = timestamp - this._fpsLastTime;
      if (elapsed > 0 && Number.isFinite(elapsed)) {
        this._fpsElapsed += elapsed;
        this._fpsFrames++;
      }
    }
    this._fpsLastTime = timestamp;
    if (this._fpsElapsed >= 500) {
      const frameMs = this._fpsElapsed / this._fpsFrames;
      if (this.dom.fpsCounter) {
        this.dom.fpsCounter.textContent = `${Math.round(1000 / frameMs)} FPS · ${frameMs.toFixed(1)} мс`;
      }
      this._fpsElapsed = 0;
      this._fpsFrames = 0;
    }
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
    this.hideGameOver();
    this.closeBattleMenu();
    this.closeIntel();
    this.closeHelp();
    this.setGameSpeed(1.0);
    this.renderUpgrades();
    this.updateHUD();
  }

  _handleKeyDown(e) {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) return;
    // Space activates a focused button; it must not also toggle the global pause.
    if (e.target?.tagName === 'BUTTON' && (e.code === 'Space' || e.key === ' ')) return;
    if (e.key === 'Escape') {
      if (this.dom.modalIntel && !this.dom.modalIntel.classList.contains('hidden')) {
        this.closeIntel();
        return;
      }
      if (this.dom.modalHelp && !this.dom.modalHelp.classList.contains('hidden')) {
        this.closeHelp();
        return;
      }
      if (this.dom.modalBattleMenu && !this.dom.modalBattleMenu.classList.contains('hidden')) {
        this.resumeBattle();
        return;
      }
      if (!this.world.inMenu && !this.world.isGameOver) {
        this.openBattleMenu();
        return;
      }
    }
    if (this.world.inMenu || this.world.isGameOver) return; // Ignore simulation hotkeys while in menu or game over
    if (this.dom.modalBattleMenu && !this.dom.modalBattleMenu.classList.contains('hidden')) {
      // Space / P and speed shortcuts must never resume combat behind this menu.
      if (e.code === 'Space' && e.target?.tagName !== 'BUTTON') e.preventDefault();
      if (e.key === 'Tab') {
        const first = this.dom.btnBattleResume;
        const last = this.dom.btnBattleExit;
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
      return;
    }
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
          ? `ДО БОССА: ${data.remaining.toFixed(1)}с`
          : `ДО ВОЛНЫ ${data.nextWave}: ${data.remaining.toFixed(1)}с`;
      }
    });

    this.world.eventBus.on('WAVE_STARTED', (data) => {
      if (this.dom.intermissionContainer) {
        this.dom.intermissionContainer.classList.add('hidden');
      }
      if (this.dom.waveText) {
        const isBoss = data.wave % 10 === 0;
        this.dom.waveText.textContent = isBoss
          ? `ВОЛНА ${String(data.wave).padStart(2, '0')} · БОСС`
          : `ВОЛНА ${String(data.wave).padStart(2, '0')}`;
        this.dom.waveText.style.color = isBoss ? '#ff0055' : '';
        this.dom.waveText.style.textShadow = isBoss ? '0 0 14px #ff0055' : '';
      }
      this.totalEnemies = data.totalEnemies;
      this.enemiesAlive = data.totalEnemies;
      this._updateEnemiesCount();
    });

    this.world.eventBus.on('WAVE_PROGRESS', (data) => {
      this.totalEnemies = data.total;
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
      this.updateUpgradeCards();
    });

    this.world.eventBus.on('UPGRADE_PURCHASED', () => {
      this.updateUpgradeCards();
      this.updateHUD();
    });

    this.world.eventBus.on('TOWER_DAMAGED', () => {
      this.updateHUD();
    });
    this.world.eventBus.on('TOWER_HEALED', ({ towerId }) => this._updateHealthHUD(this.world.getComponent(towerId, HealthComponent)));

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
    if (this.dom.waveBarFill) {
      const progress = this.totalEnemies > 0 ? Math.max(0, Math.min(1, 1 - this.enemiesAlive / this.totalEnemies)) : 0;
      this.dom.waveBarFill.style.width = `${(progress * 100).toFixed(1)}%`;
    }
    if (this.dom.enemyText) {
      this.dom.enemyText.textContent = `ВРАГИ: ${this.enemiesAlive}`;
    }
  }

  switchTab(tabName) {
    this.activeTab = tabName;
    if (this.dom.sidebar) this.dom.sidebar.dataset.category = tabName;
    for (const [key, button] of [['offense', this.dom.tabOffense], ['defense', this.dom.tabDefense], ['utility', this.dom.tabUtility]]) {
      button?.setAttribute('aria-pressed', String(key === tabName));
    }
    if (this.dom.upgradesList) this.dom.upgradesList.scrollTop = 0;
    this.dom.tabOffense?.classList.toggle('active', tabName === 'offense');
    this.dom.tabDefense?.classList.toggle('active', tabName === 'defense');
    this.dom.tabUtility?.classList.toggle('active', tabName === 'utility');
    this.renderUpgrades();
  }

  setGameSpeed(speed, { resume = true } = {}) {
    if (this.world.isGameOver || this.world.inMenu || !GAME_SPEEDS.includes(speed)) return;
    const wasPaused = this.world.isPaused;
    this.world.gameSpeed = speed;
    if (resume) this.world.isPaused = false;
    this._updatePauseButton();
    if (wasPaused && !this.world.isPaused) {
      this.world.eventBus.emit('PAUSE_TOGGLED', { isPaused: false });
    }
  }

  stepGameSpeed(direction) {
    const index = GAME_SPEEDS.indexOf(this.world.gameSpeed);
    const nextIndex = Math.max(0, Math.min(GAME_SPEEDS.length - 1, index + direction));
    // Selecting a speed while paused leaves the separate play button in control.
    this.setGameSpeed(GAME_SPEEDS[nextIndex], { resume: false });
  }

  _updateSpeedControls() {
    if (this.dom.speedValue) this.dom.speedValue.textContent = `${this.world.gameSpeed.toFixed(1)}×`;
    if (this.dom.btnSpeedDown) this.dom.btnSpeedDown.disabled = this.world.gameSpeed <= GAME_SPEEDS[0];
    if (this.dom.btnSpeedUp) this.dom.btnSpeedUp.disabled = this.world.gameSpeed >= GAME_SPEEDS[GAME_SPEEDS.length - 1];
  }

  togglePause() {
    if (this.world.isGameOver || this.world.inMenu) return;
    this.world.isPaused = !this.world.isPaused;
    this._updatePauseButton();
    this.world.eventBus.emit('PAUSE_TOGGLED', { isPaused: this.world.isPaused });
  }

  _updatePauseButton() {
    this._updateSpeedControls();
    if (!this.dom.btnPause) return;
    const isPaused = !!this.world.isPaused;
    this.dom.btnPause.classList.toggle('active', isPaused);
    this.dom.btnPause.title = isPaused ? 'Продолжить игру (Пробел / P)' : 'Пауза (Пробел / P)';
    this.dom.btnPause.textContent = isPaused ? '▶' : '⏸';
  }

  _bindAudioControls() {
    const controls = [[this.dom.btnSfx, 'sfx'], [this.dom.menuBtnSfx, 'sfx'],
      [this.dom.btnMusic, 'bgm'], [this.dom.menuBtnMusic, 'bgm']];
    for (const [button, channel] of controls) {
      if (!button) continue;
      button.setAttribute('aria-expanded', 'false');
      button.setAttribute('aria-controls', 'volume-popover');
      button.addEventListener('click', () => this.toggleVolumePopover(button, channel));
      button.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        if (channel === 'sfx') this.audioSystem.toggleSfxMute();
        else this.audioSystem.toggleBgmMute();
        this._updateAudioButtons();
      });
    }
    this.dom.volumeSlider?.addEventListener('input', () => {
      const value = Number(this.dom.volumeSlider.value) / 100;
      if (this._volumeChannel === 'sfx') this.audioSystem.setSfxVolume(value);
      else this.audioSystem.setBgmVolume(value);
      this._updateAudioButtons();
    });
    this.dom.volumeMute?.addEventListener('click', () => {
      if (this._volumeChannel === 'sfx') this.audioSystem.toggleSfxMute();
      else this.audioSystem.toggleBgmMute();
      this._updateAudioButtons();
    });
    this.dom.volumePopover?.addEventListener('keydown', (event) => {
      // Slider arrows, Space and number keys must not trigger gameplay shortcuts.
      event.stopPropagation();
      if (event.key === 'Escape') {
        event.preventDefault();
        const anchor = this._volumeAnchor;
        this.closeVolumePopover();
        anchor?.focus();
      }
    });
    this._boundVolumeOutside = (event) => {
      if (!this.dom.volumePopover?.contains(event.target) && !this._volumeAnchor?.contains(event.target)) {
        this.closeVolumePopover();
      }
    };
    this._boundVolumeResize = () => this.closeVolumePopover();
    document.addEventListener('pointerdown', this._boundVolumeOutside);
    window.addEventListener('resize', this._boundVolumeResize);
  }

  toggleVolumePopover(button, channel) {
    const wasOpen = this._volumeAnchor === button;
    this.closeVolumePopover();
    if (wasOpen || !this.dom.volumePopover) return;
    this._volumeAnchor = button;
    this._volumeChannel = channel;
    this.dom.volumePopover.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    this.dom.volumeLabel.textContent = channel === 'sfx' ? 'ГРОМКОСТЬ ЗВУКОВ' : 'ГРОМКОСТЬ МУЗЫКИ';
    this._syncVolumeSlider();
    const rect = button.getBoundingClientRect();
    const panel = this.dom.volumePopover;
    const margin = 8;
    const left = Math.max(margin, Math.min(rect.right - panel.offsetWidth, window.innerWidth - panel.offsetWidth - margin));
    const below = rect.bottom + margin;
    const top = below + panel.offsetHeight <= window.innerHeight - margin ? below : Math.max(margin, rect.top - panel.offsetHeight - margin);
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    this.dom.volumeSlider.focus();
  }

  closeVolumePopover() {
    this._volumeAnchor?.setAttribute('aria-expanded', 'false');
    this._volumeAnchor = null;
    this._volumeChannel = null;
    if (this.dom.volumePopover) this.dom.volumePopover.hidden = true;
  }

  _syncVolumeSlider() {
    if (!this._volumeChannel || !this.dom.volumeSlider) return;
    const sfx = this._volumeChannel === 'sfx';
    const muted = sfx ? this.audioSystem.sfxMuted : this.audioSystem.bgmMuted;
    const volume = sfx ? this.audioSystem.sfxVolume : this.audioSystem.bgmVolumeFactor;
    const percent = muted ? 0 : Math.round(volume * 100);
    this.dom.volumeSlider.value = String(percent);
    this.dom.volumeValue.textContent = `${percent}%`;
    this.dom.volumeMute.textContent = muted || volume === 0 ? 'ВКЛЮЧИТЬ' : 'ВЫКЛЮЧИТЬ';
  }

  _updateAudioButtons() {
    this._syncVolumeSlider();
    if (this.dom.btnSfx && this.audioSystem) {
      const info = this.audioSystem.getSfxLabel();
      const level = info.isMuted ? 'ВЫКЛ' : `${Math.round(this.audioSystem.sfxVolume * 100)}%`;
      this.dom.btnSfx.innerHTML = `<span class="audio-icon">${info.icon}</span><span class="audio-label">ЗВУК</span><span class="audio-level">${level}</span>`;
      this.dom.btnSfx.title = info.title;
      this.dom.btnSfx.classList.toggle('muted', info.isMuted);
    }
    if (this.dom.menuLabelSfx && this.audioSystem) {
      const info = this.audioSystem.getSfxLabel();
      this.dom.menuLabelSfx.textContent = info.isMuted ? 'ЗВУКИ: ВЫКЛ' : `ЗВУКИ: ${Math.round(this.audioSystem.sfxVolume * 100)}%`;
      this.dom.menuBtnSfx?.classList.toggle('muted', info.isMuted);
      if (this.dom.menuBtnSfx) this.dom.menuBtnSfx.title = info.title;
    }

    if (this.dom.btnMusic && this.audioSystem) {
      const info = this.audioSystem.getBgmLabel();
      const level = info.isMuted ? 'ВЫКЛ' : `${Math.round(this.audioSystem.bgmVolumeFactor * 100)}%`;
      this.dom.btnMusic.innerHTML = `<span class="audio-icon">${info.icon}</span><span class="audio-label">МУЗЫКА</span><span class="audio-level">${level}</span>`;
      this.dom.btnMusic.title = info.title;
      this.dom.btnMusic.classList.toggle('muted', info.isMuted);
    }
    if (this.dom.menuLabelMusic && this.audioSystem) {
      const info = this.audioSystem.getBgmLabel();
      this.dom.menuLabelMusic.textContent = info.isMuted ? 'МУЗЫКА: ВЫКЛ' : `МУЗЫКА: ${Math.round(this.audioSystem.bgmVolumeFactor * 100)}%`;
      this.dom.menuBtnMusic?.classList.toggle('muted', info.isMuted);
      if (this.dom.menuBtnMusic) this.dom.menuBtnMusic.title = info.title;
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

    const ratio = getHealthRatio(health.current, health.max);
    const pct = ratio * 100;
    const pctStr = `${pct.toFixed(1)}%`;
    if (this.dom.hpBarFill && this.dom.hpBarFill.style.width !== pctStr) {
      this.dom.hpBarFill.style.width = pctStr;
    }
    const color = getHealthColor(ratio);
    if (this.dom.hpBarFill && this.dom.hpBarFill.style.backgroundColor !== color) {
      this.dom.hpBarFill.style.backgroundColor = color;
    }

    const displayCurrent = Math.min(health.max, Math.ceil(health.current));
    if (this.dom.hpText && (this._lastDisplayHp !== displayCurrent || this._lastMaxHp !== health.max || this._lastRegenRate !== health.regenRate)) {
      this._lastDisplayHp = displayCurrent;
      this._lastMaxHp = health.max;
      this._lastRegenRate = health.regenRate;
      const regenText = health.regenRate > 0 ? `+${health.regenRate.toFixed(1)}/с` : '';
      this.dom.hpText.innerHTML = `<span class="hp-label">HP</span><span class="hp-value"><strong>${displayCurrent}</strong> / ${health.max}</span>${regenText ? `<span class="hp-regen">${regenText}</span>` : ''}`;
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

    const allUpgrades = this.upgradeManager.getAllUpgrades();
    const categoryUpgrades = allUpgrades.filter(u => u.category === this.activeTab);
    const rows = UPGRADE_LAYOUT[this.activeTab] || [];
    const orderedIds = rows.flat();
    const byId = new Map(categoryUpgrades.map(u => [u.id, u]));
    const filtered = [...orderedIds.map(id => byId.get(id)).filter(Boolean),
      ...categoryUpgrades.filter(u => !orderedIds.includes(u.id))];
    const wideIds = new Set(rows.filter(row => row.length === 1).flat());

    this.dom.upgradesList.innerHTML = '';
    this.upgradeCardsMap.clear();

    for (const u of filtered) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `upgrade-card upgrade-buy-btn${wideIds.has(u.id) ? ' wide' : ''}${u.category === 'utility' || u.id === 'knockbackPower' || u.id === 'critChance' ? ' wrap-title' : ''}`;
      card.dataset.upgrade = u.id;
      card.innerHTML = `
        <span class="upgrade-header">
          <span class="upgrade-title">${UPGRADE_LABELS[u.id] || u.name}</span>
          <span class="upgrade-lvl"></span>
        </span>
        <span class="upgrade-stats">
          <span class="stat-current"></span><span class="stat-arrow" aria-hidden="true">→</span><span class="stat-next"></span>
        </span>
        <span class="upgrade-footer"><span class="upgrade-price"></span><span class="upgrade-hint">УЛУЧШИТЬ</span></span>
      `;

      const levelEl = card.querySelector('.upgrade-lvl');
      const currentEl = card.querySelector('.stat-current');
      const nextEl = card.querySelector('.stat-next');
      const buyBtn = card;
      const priceEl = card.querySelector('.upgrade-price');
      const hintEl = card.querySelector('.upgrade-hint');

      buyBtn.addEventListener('click', () => {
        this.upgradeManager.buyUpgrade(u.id, this.world);
      });

      this.upgradeCardsMap.set(u.id, {
        cardEl: card,
        levelEl,
        currentEl,
        nextEl,
        buyBtn,
        priceEl,
        hintEl,
        def: u
      });

      this.dom.upgradesList.appendChild(card);
    }

    this.updateUpgradeCards();
  }

  updateUpgradeCards() {
    if (!this.dom.upgradesList || !this.upgradeManager || this.upgradeCardsMap.size === 0) return;

    const towers = this.world.getEntitiesWith(TowerComponent, EconomyComponent);
    const currentCredits = towers.length > 0 ? this.world.getComponent(towers[0], EconomyComponent).credits : 0;

    for (const [id, item] of this.upgradeCardsMap) {
      const u = item.def;
      const lvl = this.upgradeManager.getLevel(id);
      const cost = this.upgradeManager.getCost(id);
      const currentVal = this.upgradeManager.getCurrentValue(id);
      const nextVal = this.upgradeManager.getNextValue(id);

      const isUnlocked = this.upgradeManager.isUnlocked(id);
      const isMax = Boolean(u.maxLevel && lvl >= u.maxLevel);
      const canAfford = isUnlocked && !isMax && currentCredits >= cost;
      const shouldDisable = !canAfford || isMax || !isUnlocked;
      const lockReason = this.upgradeManager.getLockReason(id);

      item.cardEl.classList.toggle('maxed', isMax);
      item.cardEl.classList.toggle('locked', !isUnlocked);
      item.levelEl.textContent = `УР. ${lvl}${u.maxLevel ? `/${u.maxLevel}` : ''}`;
      item.currentEl.textContent = u.format(currentVal) + (u.valueSuffix || '');
      item.nextEl.textContent = isMax ? 'MAX' : u.format(nextVal);

      item.buyBtn.setAttribute('aria-label', `${u.name}: ${u.format(currentVal)} → ${u.format(nextVal)}. ${!isUnlocked ? lockReason : isMax ? 'Максимальный уровень' : `Купить за ${cost.toLocaleString()} кредитов`}. ${u.description || ''}`);
      item.buyBtn.title = [u.description || u.name, lockReason].filter(Boolean).join(' ');
      item.buyBtn.disabled = shouldDisable;
      item.buyBtn.classList.toggle('disabled', shouldDisable);

      if (!isUnlocked) {
        item.priceEl.textContent = 'НУЖЕН ШАНС';
        item.hintEl.textContent = 'ЗАКРЫТО';
      } else if (isMax) {
        item.priceEl.textContent = 'МАКСИМУМ';
        item.hintEl.textContent = '✓';
      } else {
        item.priceEl.textContent = `${cost.toLocaleString()} ◈`;
        item.hintEl.textContent = 'УЛУЧШИТЬ';
      }
    }
  }

  hideGameOver() {
    if (this.dom.modalGameOver) {
      this.dom.modalGameOver.classList.add('hidden');
    }
    this._updatePauseButton();
  }

  showMainMenu() {
    this.closeVolumePopover();
    document.getElementById('game-app')?.classList.add('in-menu');
    this.dom.mainMenu?.classList.remove('hidden');
    this.dom.modalGameOver?.classList.add('hidden');
    this.closeBattleMenu();
    this.dom.modalIntel?.classList.add('hidden');
    this.dom.modalHelp?.classList.add('hidden');
    this._updateAudioButtons();
  }

  hideMainMenu() {
    this.closeVolumePopover();
    this.intelRenderer?.stop();
    document.getElementById('game-app')?.classList.remove('in-menu');
    this.dom.mainMenu?.classList.add('hidden');
    this.dom.modalIntel?.classList.add('hidden');
    this.dom.modalHelp?.classList.add('hidden');
    this.closeBattleMenu();
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

  openBattleMenu() {
    if (this.world.inMenu || this.world.isGameOver) return;
    this.closeVolumePopover();
    if (!this.world.isPaused) this.togglePause();
    this.dom.modalBattleMenu?.classList.remove('hidden');
    this.dom.btnBattleResume?.focus();
  }

  closeBattleMenu() {
    this.closeVolumePopover();
    this.dom.modalBattleMenu?.classList.add('hidden');
  }

  resumeBattle() {
    this.closeBattleMenu();
    if (this.world.isPaused) this.togglePause();
    this.dom.btnToMenu?.focus();
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
