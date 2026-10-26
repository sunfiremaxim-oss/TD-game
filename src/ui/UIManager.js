/**
 * UIManager.js
 * Strictly isolated DOM UI manager.
 * Handles HUD panels, upgrade tabs, game speed, and modals.
 */

import { TowerComponent } from '../components/TowerComponent.js';
import { HealthComponent } from '../components/HealthComponent.js';
import { EconomyComponent } from '../components/EconomyComponent.js';
import { getHealthRatio, getHealthColor } from '../visuals/HealthVisuals.js';
import { AegisShieldVisual, AEGIS_SHIELD_ATTENUATION } from '../visuals/AegisShieldVisual.js';
import { i18n, t } from '../i18n/I18n.js';
import { STAGES, getStage } from '../config/StageConfig.js';
import { UPGRADE_TIERS } from '../config/UpgradeTiers.js';
import { GameConfig } from '../config/GameConfig.js';
import { EnemyVisualCache } from '../visuals/BattleVisualCache.js';
import { drawArchitectBody, drawArchitectCore } from '../visuals/ArchitectVisual.js';
import { drawCarrierBody } from '../visuals/CarrierVisual.js';
import { drawBossHullHealth } from '../visuals/BossHealthVisual.js';
import { drawScoutBossBody } from '../visuals/ScoutBossVisual.js';
import { drawRailgunBody } from '../visuals/RailgunVisual.js';

export const COMPACT_BATTLE_QUERY = '(max-width: 1100px), (max-height: 600px)';

// Each inner array is one logical row, independent of config declaration order.
export const UPGRADE_LAYOUT = {
  offense: [['damage', 'attackSpeed'], ['range'], ['critChance', 'critDamage'], ['multishotChance', 'multishotTargets'],
    ['ricochetChance', 'ricochetCount'], ['rapidFireChance', 'rapidFireDuration']],
  defense: [['maxHealth', 'healthRegen'], ['armorPercent', 'flatArmor'],
    ['damageReflection', 'lifeSteal'], ['knockbackChance', 'knockbackPower']],
  utility: [['killCashBonus', 'waveCashBonus'], ['crystalDropChance', 'crystalWaveBonus'], ['freeAttackChance'], ['freeDefenseChance'], ['freeEconomyChance']]
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
  constructor(world, upgradeManager, audioSystem, playerProgress = null) {
    this.world = world;
    this.upgradeManager = upgradeManager;
    this.audioSystem = audioSystem;
    this.playerProgress = playerProgress;
    this.selectedStage = Math.min(STAGES.length, (playerProgress?.completedStages || 0) + 1);
    this.permanentCardsMap = new Map();
    this.tierCardsMap = new Map();

    this.activeTab = 'offense'; // 'offense' | 'defense' | 'utility'
    this.upgradeCardsMap = new Map();
    this.fpsEnabled = false;
    this.crystalBalance = 0;
    this._pendingRunExit = null;
    this._resetFpsSample();
    this._boundFpsVisibility = () => this._resetFpsSample();

    // DOM references
    this.dom = {
      waveText: document.getElementById('hud-wave'),
      waveBarFill: document.getElementById('hud-wave-fill'),
      sidebar: document.getElementById('sidebar'),
      enemyText: document.getElementById('hud-enemies'),
      creditsText: document.getElementById('hud-credits'),
      runCrystals: document.getElementById('hud-run-crystals'),
      crystalBalance: document.getElementById('meta-crystals'),
      crystalWallet: document.getElementById('meta-wallet'),
      crystalSaveNote: document.getElementById('meta-save-status'),
      gameOverCrystals: document.getElementById('gameover-crystals'),
      gameOverCrystalBalance: document.getElementById('gameover-crystal-balance'),
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
      speedControls: document.getElementById('speed-controls'),
      arenaSpeedSlot: document.getElementById('arena-speed-slot'),
      mobileSpeedSlot: document.getElementById('mobile-speed-slot'),
      arenaMenuButtons: document.getElementById('arena-menu-buttons'),
      mobileMenuSlot: document.getElementById('arena-menu-slot'),
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
      resultTitle: document.getElementById('result-title'),
      resultDescription: document.getElementById('result-description'),
      resultUnlock: document.getElementById('result-unlock'),
      finalWaveText: document.getElementById('modal-final-wave'),
      btnRestart: document.getElementById('btn-restart'),
      btnGameOverMenu: document.getElementById('btn-gameover-menu'),

      // Main menu & dialogs
      mainMenu: document.getElementById('main-menu'),
      menuPageHome: document.getElementById('menu-page-home'),
      menuCoreDisplay: document.getElementById('menu-core-display'),
      menuHomeCoreSlot: document.getElementById('menu-home-core-slot'),
      menuContent: document.getElementById('menu-content'),
      menuHomeCopy: document.getElementById('menu-home-copy'),
      menuPageUpgrades: document.getElementById('menu-page-upgrades'),
      menuPageSettings: document.getElementById('menu-page-settings'),
      menuLanguage: document.getElementById('menu-btn-language'),
      battleLanguage: document.getElementById('btn-language'),
      btnMenuHome: document.getElementById('btn-menu-home'),
      btnMenuUpgrades: document.getElementById('btn-menu-upgrades'),
      btnMenuSettings: document.getElementById('btn-menu-settings'),
      menuBtnFps: document.getElementById('menu-btn-fps'),
      menuFpsState: document.getElementById('menu-fps-state'),
      metaTabs: ['offense', 'defense', 'utility'].map(key => ({ key,
        button: document.getElementById(`menu-meta-${key}`),
        panel: document.getElementById(`menu-meta-panel-${key}`) })),
      btnMenuStart: document.getElementById('btn-menu-start'),
      stageSelector: document.getElementById('stage-selector'),
      stagePrev: document.getElementById('stage-prev'),
      stageNext: document.getElementById('stage-next'),
      stageInfo: document.getElementById('stage-info'),
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
      battleMenuDialog: document.getElementById('battle-menu-dialog'),
      battleMenuMain: document.getElementById('battle-menu-main'),
      abandonConfirm: document.getElementById('abandon-run-confirm'),
      abandonText: document.getElementById('abandon-run-text'),
      abandonAccept: document.getElementById('btn-abandon-accept'),
      abandonCancel: document.getElementById('btn-abandon-cancel'),
      btnBattleResume: document.getElementById('btn-battle-resume'),
      btnBattleRestart: document.getElementById('btn-battle-restart'),
      btnBattleExit: document.getElementById('btn-battle-exit')
    };

    this.enemiesAlive = 0;
    this.currentWave = 1;
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
    this._staticLanguageBindings = i18n.bindDOM(document.body);
    i18n.translateDOM(this._staticLanguageBindings);
    this._unsubscribeLanguage = i18n.onChange(() => this._refreshLanguage());
    this._bindEvents();
    this._setupResponsiveSpeedControls();
    this._setupMenuSceneLayout();
    this._subscribeWorldEvents();
    this._setupStageSelection();
    this.renderUpgrades();
    this.renderPermanentUpgrades();
    this.updateHUD();
    this._updateAudioButtons();
    this._updatePauseButton();
    this.intelRenderer = new EnemyIntelRenderer();
    this._updateBestiary();
    this._refreshLanguage();
  }

  destroy() {
    this.dom.stageSelector?.removeEventListener('click', this._boundStageClick);
    this._boundStageClick = null;
    this._unsubscribeLanguage?.();
    this._menuSceneObserver?.disconnect();
    this._menuSceneObserver = null;
    this._speedLayoutQuery?.removeEventListener('change', this._boundSpeedLayout);
    this._speedLayoutQuery = null;
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

  _refreshLanguage() {
    i18n.translateDOM(this._staticLanguageBindings || []);
    if (document.documentElement) document.documentElement.lang = i18n.language;
    for (const button of [this.dom.menuLanguage, this.dom.battleLanguage]) {
      if (!button) continue;
      button.textContent = i18n.label;
      button.setAttribute('aria-label', t('Язык: {language}. Нажмите, чтобы переключить.', { language: i18n.label }));
    }
    this._lastDisplayHp = null;
    this._lastRunCrystals = null;
    this.updateHUD();
    this.updateUpgradeCards();
    this.renderPermanentUpgrades();
    this._updateAudioButtons();
    this._updatePauseButton();
    if (this.dom.waveText) {
      this.dom.waveText.textContent = this._waveLabel();
      this.dom.waveText.title = this._isBossWave(this.currentWave) ? t('Волна босса') : '';
    }
    this._updateEnemiesCount();
    if (this.dom.finalWaveText) this.dom.finalWaveText.textContent = t('Волна {wave}', { wave: this.currentWave });
    this._updateStageSelection();
    this._updateResultText();
    const amount = this.crystalBalance.toLocaleString(i18n.locale);
    if (this.dom.crystalBalance) this.dom.crystalBalance.textContent = amount;
    if (this.dom.gameOverCrystalBalance) this.dom.gameOverCrystalBalance.textContent = amount;
    this.dom.crystalWallet?.setAttribute('aria-label', t('Микрочипы: {amount}. Постоянная валюта.', { amount }));
    if (this.dom.menuFpsState) this.dom.menuFpsState.textContent = t(this.fpsEnabled ? 'ВКЛ' : 'ВЫКЛ');
    if (this.dom.btnFps) this.dom.btnFps.title = t(this.fpsEnabled ? 'Скрыть счётчик FPS' : 'Показать счётчик FPS');
    if (this.dom.fpsCounter) this.dom.fpsCounter.textContent = this._fpsReading ? t('{fps} FPS · {ms} мс', this._fpsReading) : t('— FPS · — мс');
    if (this._intermission) this._updateIntermissionText(this._intermission);
    if (this._volumeChannel && this.dom.volumeLabel) this.dom.volumeLabel.textContent = t(this._volumeChannel === 'sfx' ? 'ГРОМКОСТЬ ЗВУКОВ' : 'ГРОМКОСТЬ МУЗЫКИ');
    this._updateRunExitText();
    this._syncMenuUpgradeLayout();
  }

  _updateIntermissionText(data) {
    if (!this.dom.intermissionText) return;
    this.dom.intermissionText.textContent = this._isBossWave(data.nextWave)
      ? t('ДО БОССА: {time}с', { time: data.remaining.toFixed(1) })
      : t('ДО ВОЛНЫ {wave}: {time}с', { wave: data.nextWave, time: data.remaining.toFixed(1) });
  }

  _isBossWave(wave) {
    const stage = getStage(this.world.stageId);
    return stage ? Boolean(stage.boss) && wave === stage.waves : wave % 10 === 0;
  }

  _waveLabel() {
    const stage = getStage(this.world.stageId);
    return stage ? t('Волна {wave}/{total}:', { wave: this.currentWave, total: stage.waves })
      : t('Волна {wave}:', { wave: this.currentWave });
  }

  _setupStageSelection() {
    if (!this.dom.stageSelector || this._boundStageClick) return;
    this._boundStageClick = event => {
      const button = event.target.closest('[data-stage-step]');
      if (!button || !this.world.inMenu) return;
      const step = Number(button.dataset.stageStep);
      if (step !== -1 && step !== 1) return;
      const id = this.selectedStage + step;
      if (!this.playerProgress?.isStageUnlocked(id)) return;
      this.selectedStage = id;
      this._updateStageSelection();
    };
    this.dom.stageSelector.addEventListener('click', this._boundStageClick);
    this._updateStageSelection();
  }

  _updateStageSelection() {
    const stage = getStage(this.selectedStage);
    if (!stage) return;
    if (this.dom.stageInfo) this.dom.stageInfo.textContent = t('Уровень {stage}', { stage: stage.id });
    if (this.dom.stagePrev) this.dom.stagePrev.disabled = stage.id === 1;
    if (this.dom.stageNext) this.dom.stageNext.disabled = stage.id === STAGES.length || !this.playerProgress?.isStageUnlocked(stage.id + 1);
  }

  _updateResultText() {
    const victory = this.world.runOutcome === 'victory';
    if (this.dom.resultTitle) this.dom.resultTitle.textContent = t(victory ? 'СТАДИЯ ПРОЙДЕНА' : 'СИСТЕМА СБИТА');
    if (this.dom.resultDescription) this.dom.resultDescription.textContent = t(victory ? 'Босс уничтожен. Микрочипы зачислены.' : 'Центральное ядро уничтожено роем.');
    this.dom.modalGameOver?.classList.toggle('victory', victory);
    if (this.dom.resultUnlock) {
      this.dom.resultUnlock.hidden = !victory;
      this.dom.resultUnlock.textContent = this.world.stageId === STAGES.length ? t('Все 8 стадий пройдены!')
        : t('Следующая стадия: {stage}', { stage: (this.world.stageId || 1) + 1 });
    }
    if (this.dom.btnRestart) this.dom.btnRestart.textContent = t(victory ? 'СЫГРАТЬ СНОВА' : 'ПЕРЕЗАПУСТИТЬ');
    if (victory && this.dom.finalWaveText) this.dom.finalWaveText.textContent = t('Стадия {stage} · Волна {wave}', { stage: this.world.stageId, wave: this.currentWave });
  }

  _updateRunExitText() {
    if (!this._pendingRunExit) return;
    const economy = this._runEconomy();
    if (!economy) return;
    if (this.dom.abandonText) this.dom.abandonText.textContent = t('Вы потеряете все микрочипы за этот бой: {amount}. Они зачисляются после победы или поражения. Постоянный кошелёк не изменится.', { amount: economy.runCrystals.toLocaleString(i18n.locale) });
    if (this.dom.abandonAccept) this.dom.abandonAccept.textContent = t(this._pendingRunExit === 'RESTART_GAME' ? 'ПОТЕРЯТЬ И ПЕРЕЗАПУСТИТЬ' : 'ПОТЕРЯТЬ И ВЫЙТИ');
  }

  _setupResponsiveSpeedControls() {
    if (this._speedLayoutQuery || !this.dom.speedControls || !this.dom.arenaSpeedSlot || !this.dom.mobileSpeedSlot) return;
    this._speedLayoutQuery = window.matchMedia(COMPACT_BATTLE_QUERY);
    this._boundSpeedLayout = () => this._placeSpeedControls();
    this._speedLayoutQuery.addEventListener('change', this._boundSpeedLayout);
    this._placeSpeedControls();
  }

  _setupMenuSceneLayout() {
    if (this._menuSceneObserver || typeof ResizeObserver === 'undefined') return;
    this._menuSceneObserver = new ResizeObserver(() => this._syncMenuUpgradeLayout());
    for (const node of [this.dom.menuPageHome, this.dom.menuHomeCopy, this.dom.menuCoreDisplay]) {
      if (node) this._menuSceneObserver.observe(node);
    }
  }

  _syncMenuUpgradeLayout() {
    const { menuContent: content, menuHomeCopy: copy, menuCoreDisplay: core, menuPageHome: home, menuPageUpgrades: upgrades } = this.dom;
    if (!content?.getBoundingClientRect || !copy || !core || !home || !upgrades) return;
    if (!['home', 'upgrades'].includes(this.activeMenuPage)) return;
    const bounds = content.getBoundingClientRect(), text = copy.getBoundingClientRect(), model = core.getBoundingClientRect();
    if (!bounds.width || !text.width || !model.width) return;
    const padding = getComputedStyle(home);
    const beside = model.left >= text.right - 1;
    const x = text.left - bounds.left;
    const y = beside ? parseFloat(padding.paddingTop) : text.top - bounds.top;
    upgrades.style.setProperty('--upgrade-x', `${x}px`);
    upgrades.style.setProperty('--upgrade-y', `${y}px`);
    upgrades.style.setProperty('--upgrade-width', `${text.width}px`);
    upgrades.style.setProperty('--upgrade-height', `${Math.max(0, bounds.height - y - parseFloat(padding.paddingBottom))}px`);
  }

  _placeSpeedControls() {
    const destination = this._speedLayoutQuery.matches ? this.dom.mobileSpeedSlot : this.dom.arenaSpeedSlot;
    if (this.dom.speedControls.parentElement !== destination) destination.appendChild(this.dom.speedControls);
    const menuDestination = this._speedLayoutQuery.matches ? this.dom.mobileMenuSlot : this.dom.arenaSpeedSlot;
    const menu = this.dom.arenaMenuButtons;
    if (menu && menuDestination && menu.parentElement !== menuDestination) menuDestination.appendChild(menu);
  }

  _bindEvents() {
    if (this._eventsBound) return;
    this._eventsBound = true;
    this.dom.btnFps?.addEventListener('click', () => this.toggleFps());
    this.dom.menuBtnFps?.addEventListener('click', () => this.toggleFps());
    this.dom.menuLanguage?.addEventListener('click', () => i18n.toggle());
    this.dom.battleLanguage?.addEventListener('click', () => i18n.toggle());
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
    this.dom.btnMenuHome?.addEventListener('click', () => this.switchMenuPage('home'));
    this.dom.btnMenuUpgrades?.addEventListener('click', () => this.switchMenuPage('upgrades'));
    this.dom.btnMenuSettings?.addEventListener('click', () => this.switchMenuPage('settings'));
    for (const item of this.dom.metaTabs) {
      item.button?.addEventListener('click', () => this.switchMetaTab(item.key));
    }
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
      this._requestRunExit('RESTART_GAME');
    });
    this.dom.btnBattleExit?.addEventListener('click', () => {
      this._requestRunExit('RETURN_TO_MENU');
    });
    this.dom.abandonCancel?.addEventListener('click', () => this._cancelRunExit());
    this.dom.abandonAccept?.addEventListener('click', () => {
      const event = this._pendingRunExit;
      if (!event) return;
      this.closeBattleMenu();
      this.world.eventBus.emit(event);
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
    this.dom.menuBtnFps?.setAttribute('aria-pressed', String(this.fpsEnabled));
    if (this.dom.menuFpsState) this.dom.menuFpsState.textContent = t(this.fpsEnabled ? 'ВКЛ' : 'ВЫКЛ');
    if (this.dom.btnFps) {
      this.dom.btnFps.title = t(this.fpsEnabled ? 'Скрыть счётчик FPS' : 'Показать счётчик FPS');
    }
    if (this.dom.fpsCounter) {
      this.dom.fpsCounter.hidden = !this.fpsEnabled;
      this.dom.fpsCounter.textContent = t('— FPS · — мс');
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
      this._fpsReading = { fps: Math.round(1000 / frameMs), ms: frameMs.toFixed(1) };
      if (this.dom.fpsCounter) {
        this.dom.fpsCounter.textContent = t('{fps} FPS · {ms} мс', { fps: Math.round(1000 / frameMs), ms: frameMs.toFixed(1) });
      }
      this._fpsElapsed = 0;
      this._fpsFrames = 0;
    }
  }

  reset() {
    this.currentWave = 1;
    this._intermission = null;
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
      if (this._pendingRunExit) { this._cancelRunExit(); return; }
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
      if (this.world.inMenu && this.activeMenuPage && this.activeMenuPage !== 'home') {
        this.switchMenuPage('home');
        this.dom.btnMenuHome?.focus();
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
        const first = this._pendingRunExit ? this.dom.abandonCancel : this.dom.btnBattleResume;
        const last = this._pendingRunExit ? this.dom.abandonAccept : this.dom.btnBattleExit;
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
      this._intermission = data;
      if (this.dom.intermissionContainer) {
        this.dom.intermissionContainer.classList.remove('hidden');
      }
      if (this.dom.intermissionBar) {
        this.dom.intermissionBar.style.width = `${(data.progress * 100).toFixed(1)}%`;
      }
      this._updateIntermissionText(data);
    });

    this.world.eventBus.on('WAVE_STARTED', (data) => {
      this.currentWave = data.wave;
      this._intermission = null;
      if (this.dom.intermissionContainer) {
        this.dom.intermissionContainer.classList.add('hidden');
      }
      if (this.dom.waveText) {
        const isBoss = this._isBossWave(data.wave);
        this.dom.waveText.textContent = this._waveLabel();
        this.dom.waveText.title = isBoss ? t('Волна босса') : '';
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
        this.dom.creditsText.textContent = `${data.credits.toLocaleString(i18n.locale)} ◈`;
        this.dom.creditsText.classList.remove('pulse');
        void this.dom.creditsText.offsetWidth; // trigger reflow
        this.dom.creditsText.classList.add('pulse');
      }
      this.updateUpgradeCards();
    });

    this.world.eventBus.on('UPGRADE_PURCHASED', ({ upgradeId }) => {
      this.updateUpgradeCards();
      this.updateHUD();
      this._showUpgradeFeedback(upgradeId);
    });

    this.world.eventBus.on('TOWER_DAMAGED', () => {
      this.updateHUD();
    });
    this.world.eventBus.on('TOWER_HEALED', ({ towerId }) => this._updateHealthHUD(this.world.getComponent(towerId, HealthComponent)));

    this.world.eventBus.on('GAME_OVER', () => {
      this._updateResultText();
      this.world.isPaused = true;
      this._updatePauseButton();
      if (this.dom.modalGameOver) {
        this.dom.modalGameOver.classList.remove('hidden');
      }
      if (this.dom.finalWaveText && this.dom.waveText) {
        this.dom.finalWaveText.textContent = this.dom.waveText.textContent.replace(/:$/, '');
      }
      this._updateRunCrystals();
    });
    this.world.eventBus.on('STAGE_COMPLETED', () => {
      this.world.isPaused = true;
      this.selectedStage = Math.min(STAGES.length, (this.playerProgress?.completedStages || 0) + 1);
      this._updatePauseButton();
      this._updateResultText();
      this.dom.modalGameOver?.classList.remove('hidden');
      if (this.dom.finalWaveText) this.dom.finalWaveText.textContent = t('Стадия {stage} · Волна {wave}', { stage: this.world.stageId, wave: this.currentWave });
      this._updateRunCrystals();
      this.dom.btnGameOverMenu?.focus();
    });
    this.world.eventBus.on('STAGE_PROGRESS_CHANGED', () => { this._updateStageSelection(); this._updateBestiary(); });
    this.world.eventBus.on('PROGRESS_RESET', () => {
      this.selectedStage = 1;
      this._updateStageSelection(); this._updateBestiary(); this.renderPermanentUpgrades();
    });
    this.world.eventBus.on('UPGRADE_TIER_UNLOCKED', () => {
      this.renderPermanentUpgrades();
      this.audioSystem?.playUpgradeSound();
    });
    this.world.eventBus.on('RUN_CRYSTALS_CHANGED', () => this._updateRunCrystals());
    this.world.eventBus.on('CRYSTAL_BALANCE_CHANGED', ({ balance, saved }) => {
      this.crystalBalance = balance;
      const label = balance.toLocaleString(i18n.locale);
      if (this.dom.crystalBalance) this.dom.crystalBalance.textContent = label;
      this.dom.crystalWallet?.setAttribute('aria-label', t('Микрочипы: {amount}. Постоянная валюта.', { amount: label }));
      if (this.dom.gameOverCrystalBalance) this.dom.gameOverCrystalBalance.textContent = label;
      if (this.dom.crystalSaveNote) this.dom.crystalSaveNote.hidden = saved || (balance === 0 && !Object.keys(this.playerProgress?.upgrades || {}).length && !this.playerProgress?.completedStages && !Object.values(this.playerProgress?.unlockedTiers || {}).some(count => count > 1));
      this.updatePermanentCards();
    });

    this.world.eventBus.on('PERMANENT_UPGRADE_PURCHASED', ({ upgradeId }) => {
      this.updatePermanentCards();
      this._showUpgradeFeedback(upgradeId, this.permanentCardsMap);
      this.audioSystem?.playUpgradeSound();
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
      this.dom.enemyText.textContent = t('Враги {count}', { count: this.enemiesAlive });
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
    if (this.dom.speedValue) this.dom.speedValue.textContent = `${this.world.gameSpeed < 1 ? String(this.world.gameSpeed) : this.world.gameSpeed.toFixed(1)}×`;
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
    this.dom.btnPause.title = t(isPaused ? 'Продолжить игру (Пробел / P)' : 'Пауза (Пробел / P)');
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
    this.dom.volumeLabel.textContent = t(channel === 'sfx' ? 'ГРОМКОСТЬ ЗВУКОВ' : 'ГРОМКОСТЬ МУЗЫКИ');
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
    this.dom.volumeMute.textContent = t(muted || volume === 0 ? 'ВКЛЮЧИТЬ' : 'ВЫКЛЮЧИТЬ');
  }

  _updateAudioButtons() {
    this._syncVolumeSlider();
    if (this.dom.btnSfx && this.audioSystem) {
      const info = this.audioSystem.getSfxLabel();
      const level = info.isMuted ? t('ВЫКЛ') : `${Math.round(this.audioSystem.sfxVolume * 100)}%`;
      this.dom.btnSfx.innerHTML = `<span class="audio-icon">${info.icon}</span><span class="audio-label">${t('ЗВУК')}</span><span class="audio-level">${level}</span>`;
      this.dom.btnSfx.title = info.title;
      this.dom.btnSfx.classList.toggle('muted', info.isMuted);
    }
    if (this.dom.menuLabelSfx && this.audioSystem) {
      const info = this.audioSystem.getSfxLabel();
      this.dom.menuLabelSfx.textContent = info.isMuted ? t('ЗВУКИ: ВЫКЛ') : t('ЗВУКИ: {percent}%', { percent: Math.round(this.audioSystem.sfxVolume * 100) });
      this.dom.menuBtnSfx?.classList.toggle('muted', info.isMuted);
      if (this.dom.menuBtnSfx) this.dom.menuBtnSfx.title = info.title;
    }

    if (this.dom.btnMusic && this.audioSystem) {
      const info = this.audioSystem.getBgmLabel();
      const level = info.isMuted ? t('ВЫКЛ') : `${Math.round(this.audioSystem.bgmVolumeFactor * 100)}%`;
      this.dom.btnMusic.innerHTML = `<span class="audio-icon">${info.icon}</span><span class="audio-label">${t('МУЗЫКА')}</span><span class="audio-level">${level}</span>`;
      this.dom.btnMusic.title = info.title;
      this.dom.btnMusic.classList.toggle('muted', info.isMuted);
    }
    if (this.dom.menuLabelMusic && this.audioSystem) {
      const info = this.audioSystem.getBgmLabel();
      this.dom.menuLabelMusic.textContent = info.isMuted ? t('МУЗЫКА: ВЫКЛ') : t('МУЗЫКА: {percent}%', { percent: Math.round(this.audioSystem.bgmVolumeFactor * 100) });
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
      const regenText = health.regenRate > 0 ? t('+{value}/с', { value: health.regenRate.toFixed(1) }) : '';
      this.dom.hpText.innerHTML = `<span class="hp-label">HP</span><span class="hp-value"><strong>${displayCurrent}</strong> / ${health.max}</span>${regenText ? `<span class="hp-regen">${regenText}</span>` : ''}`;
    }
  }

  updateHUD() {
    this._updateRunCrystals();
    const towers = this.world.getEntitiesWith(TowerComponent, HealthComponent, EconomyComponent);
    if (towers.length === 0) return;

    const towerId = towers[0];
    const health = this.world.getComponent(towerId, HealthComponent);
    const economy = this.world.getComponent(towerId, EconomyComponent);

    if (health) {
      this._updateHealthHUD(health);
    }

    if (economy && this.dom.creditsText) {
      this.dom.creditsText.textContent = `${economy.credits.toLocaleString(i18n.locale)} ◈`;
    }
  }

  _runEconomy() {
    const id = this.world.getEntitiesWith?.(TowerComponent, EconomyComponent)?.[0];
    return id === undefined ? null : this.world.getComponent(id, EconomyComponent);
  }

  _updateRunCrystals() {
    const amount = this._runEconomy()?.runCrystals || 0;
    if (this._lastRunCrystals === amount) return;
    this._lastRunCrystals = amount;
    if (this.dom.runCrystals) {
      this.dom.runCrystals.textContent = amount.toLocaleString(i18n.locale);
      this.dom.runCrystals.parentElement?.setAttribute('aria-label', t('Микрочипы за бой: {amount}', { amount: amount.toLocaleString(i18n.locale) }));
    }
    if (this.dom.gameOverCrystals) this.dom.gameOverCrystals.textContent = `+${amount.toLocaleString(i18n.locale)}`;
  }

  _requestRunExit(event) {
    this.closeVolumePopover();
    const eco = this._runEconomy();
    if (eco?.runCrystals > 0 && !eco.crystalsSettled) {
      this._pendingRunExit = event;
      if (this.dom.battleMenuMain) this.dom.battleMenuMain.hidden = true;
      if (this.dom.abandonConfirm) this.dom.abandonConfirm.hidden = false;
      this._updateRunExitText();
      this.dom.battleMenuDialog?.setAttribute('aria-labelledby', 'abandon-run-title');
      this.dom.abandonCancel?.focus();
      return;
    }
    this.closeBattleMenu();
    this.world.eventBus.emit(event);
  }

  _cancelRunExit(restoreFocus = true) {
    const event = this._pendingRunExit;
    this._pendingRunExit = null;
    if (this.dom.battleMenuMain) this.dom.battleMenuMain.hidden = false;
    if (this.dom.abandonConfirm) this.dom.abandonConfirm.hidden = true;
    this.dom.battleMenuDialog?.setAttribute('aria-labelledby', 'battle-menu-title');
    if (restoreFocus && event) (event === 'RESTART_GAME' ? this.dom.btnBattleRestart : this.dom.btnBattleExit)?.focus();
  }

  renderUpgrades() {
    if (!this.dom.upgradesList || !this.upgradeManager) return;

    const allUpgrades = this.upgradeManager.getAllUpgrades();
    const categoryUpgrades = allUpgrades.filter(u => u.category === this.activeTab && this.upgradeManager.hasAccess(u.id));
    const rows = UPGRADE_LAYOUT[this.activeTab] || [];
    const orderedIds = rows.flat();
    const byId = new Map(categoryUpgrades.map(u => [u.id, u]));
    const filtered = [...orderedIds.map(id => byId.get(id)).filter(Boolean),
      ...categoryUpgrades.filter(u => !orderedIds.includes(u.id))];
    const wideIds = new Set(rows.filter(row => row.length === 1).flat());

    this.dom.upgradesList.innerHTML = '';
    this.upgradeCardsMap.clear();

    for (const u of filtered) {
      const item = this._createUpgradeCard(u, wideIds.has(u.id), () => this.upgradeManager.buyUpgrade(u.id, this.world));
      this.upgradeCardsMap.set(u.id, item);
      this.dom.upgradesList.appendChild(item.cardEl);
    }
    this.updateUpgradeCards();
  }

  _createUpgradeCard(u, wide, onBuy, permanent = false) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `upgrade-card upgrade-buy-btn${wide ? ' wide' : ''}${u.category === 'utility' || ['knockbackPower', 'critChance'].includes(u.id) ? ' wrap-title' : ''}`;
    card.dataset.upgrade = u.id;
    card.innerHTML = `
      <span class="upgrade-header"><span class="upgrade-title">${t(UPGRADE_LABELS[u.id] || u.name)}</span><span class="upgrade-lvl"></span></span>
      <span class="upgrade-stats"><span class="stat-current"></span><span class="stat-arrow" aria-hidden="true">→</span><span class="stat-next"></span></span>
      <span class="upgrade-footer"><span class="upgrade-price">${permanent ? '<span class="meta-price-amount"></span><span class="chip-icon" aria-hidden="true"></span>' : ''}</span><span class="upgrade-hint">${t('УЛУЧШИТЬ')}</span></span>
      <span class="upgrade-confirm" aria-hidden="true">✓</span>`;
    card.addEventListener('click', onBuy);
    card.addEventListener('animationend', event => {
      if (event.target === card && event.animationName === 'upgrade-purchased') card.classList.remove('purchase-feedback');
    });
    return { cardEl: card, buyBtn: card, def: u,
      titleEl: card.querySelector('.upgrade-title'), levelEl: card.querySelector('.upgrade-lvl'), currentEl: card.querySelector('.stat-current'),
      nextEl: card.querySelector('.stat-next'), priceEl: card.querySelector('.upgrade-price'),
      priceAmountEl: permanent ? card.querySelector('.meta-price-amount') : null,
      chipIcon: permanent ? card.querySelector('.chip-icon') : null,
      hintEl: card.querySelector('.upgrade-hint') };
  }

  renderPermanentUpgrades() {
    if (!this.playerProgress || !this.dom.metaTabs) return;
    this.permanentCardsMap.clear();
    this.tierCardsMap = new Map();
    const catalog = this.playerProgress.getUpgradeManager().getAllUpgrades();
    const byId = new Map(catalog.map(u => [u.id, u]));
    for (const { key, panel } of this.dom.metaTabs) {
      if (!panel) continue;
      panel.innerHTML = '';
      const unlocked = this.playerProgress.unlockedTiers[key];
      UPGRADE_TIERS[key].forEach((tier, index) => {
        const heading = document.createElement('div'); heading.className = 'meta-tier-heading';
        heading.textContent = t('ТИР {tier}', { tier: index + 1 }); panel.appendChild(heading);
        if (index < unlocked) {
          for (const row of UPGRADE_LAYOUT[key]) for (const id of row.filter(id => tier.ids.includes(id))) {
            const item = this._createUpgradeCard(byId.get(id), row.length === 1, () => this.playerProgress.buyUpgrade(id), true);
            this.permanentCardsMap.set(id, item); panel.appendChild(item.cardEl);
          }
        } else {
          const card = document.createElement('button'); card.type = 'button';
          card.className = 'meta-tier-unlock'; card.dataset.tier = `${key}-${index + 1}`;
          const names = tier.ids.map(id => t(UPGRADE_LABELS[id] || byId.get(id).name)).join(' · ');
          const title = document.createElement('span'); title.className = 'meta-tier-title'; title.textContent = names;
          const hint = document.createElement('span'); hint.className = 'meta-tier-hint';
          const price = document.createElement('span'); price.className = 'meta-tier-price';
          price.innerHTML = `<span>${tier.cost}</span><span class="chip-icon" aria-hidden="true"></span>`;
          card.append(title, hint, price);
          card.addEventListener('click', () => this.playerProgress.buyTier(key, index + 1));
          this.tierCardsMap.set(`${key}-${index + 1}`, { card, hint, category: key, number: index + 1, cost: tier.cost, names });
          panel.appendChild(card);
        }
      });
    }
    this.updatePermanentCards();
  }

  updatePermanentCards() {
    if (!this.playerProgress || !this.permanentCardsMap?.size) return;
    this._updateCards(this.permanentCardsMap, this.playerProgress.getUpgradeManager(), this.playerProgress.crystals, true);
    for (const item of this.tierCardsMap?.values() || []) {
      const next = item.number === this.playerProgress.unlockedTiers[item.category] + 1;
      item.card.disabled = !next || this.playerProgress.crystals < item.cost;
      item.hint.textContent = next ? t('Открыть в бою и постоянной прокачке') : t('Сначала откройте предыдущий тир');
      item.card.setAttribute('aria-label', t('Тир {tier}: {names}. {hint}. Доступ за {cost} микрочипов.', {
        tier: item.number, names: item.names, hint: item.hint.textContent, cost: item.cost }));
    }
  }

  _updateBestiary() {
    const root = this.dom.modalIntel;
    if (!root?.querySelectorAll) return;
    const completed = this.playerProgress?.completedStages || 0;
    const known = new Set(['scout']);
    for (const stage of STAGES.slice(0, completed)) {
      for (const type of [...stage.firstHalf, ...stage.secondHalf]) known.add(type);
      if (stage.boss) known.add(stage.boss);
    }
    for (const card of root.querySelectorAll('[data-enemy-card]')) card.hidden = !known.has(card.dataset.enemyCard);
    for (const note of root.querySelectorAll('[data-intel-stage]')) note.hidden = completed < Number(note.dataset.intelStage);
    if (this._intelCompleted !== completed) {
      this._intelCompleted = completed;
      this.intelRenderer?._initCanvases();
    }
  }

  _showUpgradeFeedback(upgradeId, cards = this.upgradeCardsMap) {
    const card = cards.get(upgradeId)?.cardEl;
    if (!card) return;
    // Replay on every successful level, including rapid repeated buys. Never replace the card DOM.
    card.classList.remove('purchase-feedback');
    void card.offsetWidth;
    card.classList.add('purchase-feedback');
  }

  updateUpgradeCards() {
    if (!this.dom.upgradesList || !this.upgradeManager || this.upgradeCardsMap.size === 0) return;

    const towers = this.world.getEntitiesWith(TowerComponent, EconomyComponent);
    const currentCredits = towers.length > 0 ? this.world.getComponent(towers[0], EconomyComponent).credits : 0;

    this._updateCards(this.upgradeCardsMap, this.upgradeManager, currentCredits);
  }

  _updateCards(cards, manager, balance, permanent = false) {
    for (const [id, item] of cards) {
      const u = item.def, lvl = manager.getLevel(id), cost = manager.getCost(id);
      const currentVal = manager.getCurrentValue(id), nextVal = manager.getNextValue(id);
      const unlocked = manager.isUnlocked(id), lockReason = manager.getLockReason(id);
      const affordable = unlocked && Number.isFinite(cost) && balance >= cost;
      item.cardEl.classList.toggle('locked', !unlocked);
      if (item.titleEl) item.titleEl.textContent = t(UPGRADE_LABELS[id] || u.name);
      item.levelEl.textContent = t('УР. {level}', { level: lvl });
      item.currentEl.textContent = u.format(currentVal) + t(u.valueSuffix || '');
      item.nextEl.textContent = u.format(nextVal);
      item.buyBtn.setAttribute('aria-label', `${t(u.name)}: ${u.format(currentVal)} → ${u.format(nextVal)}. ${!unlocked ? lockReason : t(permanent ? 'Купить за {cost} микрочипов' : 'Купить за {cost} кредитов', { cost: cost.toLocaleString(i18n.locale) })}. ${permanent ? t('Стартовый уровень каждого боя.') + ' ' : ''}${t(u.description || '')}`);
      item.buyBtn.title = [permanent ? t('Постоянное улучшение: стартовый уровень каждого боя.') : '', t(u.description || u.name), lockReason].filter(Boolean).join(' ');
      item.buyBtn.disabled = !affordable;
      item.buyBtn.classList.toggle('disabled', !affordable);
      const price = item.priceAmountEl || item.priceEl;
      price.textContent = !unlocked ? t('НУЖЕН ШАНС') : Number.isFinite(cost) ? cost.toLocaleString(i18n.locale) + (permanent ? '' : ' ◈') : '—';
      if (item.chipIcon) item.chipIcon.hidden = !unlocked;
      item.hintEl.textContent = t(unlocked ? 'УЛУЧШИТЬ' : 'ЗАКРЫТО');
    }
  }

  hideGameOver() {
    if (this.dom.modalGameOver) {
      this.dom.modalGameOver.classList.add('hidden');
    }
    this._updatePauseButton();
  }

  showMainMenu() {
    this._updateStageSelection();
    this.closeVolumePopover();
    document.getElementById('game-app')?.classList.add('in-menu');
    this.dom.mainMenu?.classList.remove('hidden');
    this.dom.modalGameOver?.classList.add('hidden');
    this.closeBattleMenu();
    this.dom.modalIntel?.classList.add('hidden');
    this.dom.modalHelp?.classList.add('hidden');
    this.switchMenuPage('home');
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
    this.switchMenuPage('intel');
  }

  closeIntel() {
    this.dom.modalIntel?.classList.add('hidden');
    this.intelRenderer?.stop();
    if (this.activeMenuPage === 'intel') this.switchMenuPage('home');
  }

  switchMenuPage(page) {
    const pages = [
      ['home', this.dom.menuPageHome, this.dom.btnMenuHome],
      ['upgrades', this.dom.menuPageUpgrades, this.dom.btnMenuUpgrades],
      ['settings', this.dom.menuPageSettings, this.dom.btnMenuSettings],
      ['intel', this.dom.modalIntel, this.dom.btnMenuIntel]
    ];
    if (!pages.some(([key]) => key === page)) return;
    this.closeVolumePopover();
    this.activeMenuPage = page;
    if (this.dom.mainMenu) this.dom.mainMenu.dataset.page = page;
    for (const [key, panel, button] of pages) {
      panel?.classList.toggle('hidden', key !== page && !(key === 'home' && page === 'upgrades'));
      button?.setAttribute('aria-current', key === page ? 'page' : 'false');
    }
    this._syncMenuUpgradeLayout();
    if (page === 'upgrades') this.updatePermanentCards();
    if (page === 'intel') { this._updateBestiary(); this.intelRenderer?.start(); }
    else this.intelRenderer?.stop();
  }

  switchMetaTab(category) {
    if (!this.dom.metaTabs.some(item => item.key === category)) return;
    for (const { key, button, panel } of this.dom.metaTabs) {
      button?.setAttribute('aria-pressed', String(key === category));
      panel?.classList.toggle('hidden', key !== category);
    }
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
    this._cancelRunExit(false);
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
    this.architectVisualCache = new EnemyVisualCache();
    this.architectPainter = {
      corePulseAngle: 0,
      _drawEnemyBody: (ctx, type, render, glow, _core, variant) => {
        if (type === 'boss_scout') drawScoutBossBody(ctx, render, glow);
        else if (type === 'boss_railgun') drawRailgunBody(ctx,render,glow,variant);
        else if (type === 'boss_carrier') drawCarrierBody(ctx, render, glow, variant);
        else drawArchitectBody(ctx, render, glow, variant);
        drawBossHullHealth(ctx, type, render, { current: 1, max: 1 });
      },
      _drawBossCore: drawArchitectCore
    };
    this.aegisShieldVisual = new AegisShieldVisual();
    this.canvases = [];
    this.animationId = null;
    this.isRunning = false;
    this._initCanvases();
  }

  _initCanvases() {
    const elements = document.querySelectorAll('.intel-canvas');
    this.canvases = Array.from(elements).filter(canvas => !canvas.closest?.('.intel-card')?.hidden).map(canvas => ({
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
      case 'boss_carrier':
        this._drawBossCarrier(ctx, time);
        break;
      case 'boss_scout':
        this._drawBossScout(ctx, time);
        break;
      case 'boss_railgun':
        this._drawBossRailgun(ctx,time);
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
    // The emitter is inside the translucent shell, as in the battlefield renderer.
    const emitterRotation = time * 0.5;
    ctx.save();
    ctx.translate(60, 60);
    ctx.rotate(emitterRotation);
    ctx.globalAlpha *= AEGIS_SHIELD_ATTENUATION.opacity;

    ctx.shadowColor = '#00e5ff';
    ctx.shadowBlur = 16 * AEGIS_SHIELD_ATTENUATION.glow;
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
    this.aegisShieldVisual.draw(ctx, 60, 60, 44, time, 1, 0, emitterRotation);
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

  _drawBossRailgun(ctx,time) {
    const cfg=GameConfig.enemies.boss_railgun;
    const cycle=time%(cfg.chargeDuration+cfg.beamDuration+cfg.cooldownDuration+cfg.repositionDuration);
    const phase=cycle<cfg.chargeDuration?'charge':cycle<cfg.chargeDuration+cfg.beamDuration?'firing'
      :cycle<cfg.chargeDuration+cfg.beamDuration+cfg.cooldownDuration?'cooldown':'idle';
    ctx.save(); ctx.translate(60,60); ctx.rotate(-.25+Math.sin(time*.4)*.1); ctx.scale(44/cfg.radius,44/cfg.radius);
    this.architectVisualCache.draw(ctx,this.architectPainter,'boss_railgun',cfg,1,1.25,phase); ctx.restore();
  }

  _drawBossScout(ctx, time) {
    const previewScale = 44 / GameConfig.enemies.boss_scout.radius;
    ctx.save(); ctx.translate(60,60); ctx.rotate(time * GameConfig.enemies.boss_scout.rotationSpeed); ctx.scale(previewScale,previewScale);
    this.architectVisualCache.draw(ctx,this.architectPainter,'boss_scout',GameConfig.enemies.boss_scout,1,1.25);
    ctx.restore();
  }

  _drawBossCarrier(ctx, time) {
    const previewScale = 44 / GameConfig.enemies.boss_carrier.radius;
    ctx.save(); ctx.translate(60, 60); ctx.rotate(-.25 + Math.sin(time * .45) * .12); ctx.scale(previewScale, previewScale);
    const phase = time % 7 < 1.2 ? 'launch' : time % 7 < 5 ? 'exposed' : 'closed';
    this.architectVisualCache.draw(ctx, this.architectPainter, 'boss_carrier', GameConfig.enemies.boss_carrier, 1, 1.25, phase);
    ctx.restore();
  }

  _drawBossArchitect(ctx, time) {
    ctx.save();
    ctx.translate(60, 60);
    ctx.rotate(time * GameConfig.enemies.boss_architect.rotationSpeed);
    ctx.scale(.8, .8);
    this.architectPainter.corePulseAngle = time * 2;
    this.architectVisualCache.draw(ctx, this.architectPainter, 'boss_architect', GameConfig.enemies.boss_architect, 1, 1.25);
    ctx.restore();
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


}
