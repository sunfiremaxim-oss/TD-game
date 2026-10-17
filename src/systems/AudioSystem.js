/**
 * AudioSystem.js
 * Procedural Web Audio API sound synthesizer driven by EventBus events.
 * Manages dual-channel audio control (SFX and BGM) with volume cycling,
 * mute toggling, and instant autoplay unlocking from the very start of the game loop.
 */

export class AudioSystem {
  constructor() {
    this.audioCtx = null;
    this.sfxMasterGain = null;

    // SFX channel state (100% -> 60% -> 30% -> 0% / MUTE -> 100%)
    this.sfxVolume = 1.0;
    this.sfxMuted = false;

    // BGM channel state (100% -> 60% -> 30% -> 0% / MUTE -> 100%)
    this.baseBgmVolume = 0.38; // Balanced background level relative to SFX
    this.bgmVolumeFactor = 1.0;
    this.bgmMuted = false;

    // Background music playlist
    this.tracks = [
      'music/background_music_1.mp3',
      'music/background_music_2.mp3'
    ];
    this.currentTrackIndex = -1;
    this._shuffledQueue = [];
    this._lastRestartTime = 0;

    // Dual-player seamless crossfade engine
    this.playerA = null;
    this.playerB = null;
    this.activePlayerKey = 'A'; // 'A' or 'B'
    this._isCrossfading = false;
    this._crossfadeDuration = 3.5; // 3.5s smooth crossfade
    this._crossfadeProgress = 0;
    this._crossfadeInterval = null;

    this.isPlayingBGM = false;
    this.isBgmUnlocked = false;

    this._windowListenersAttached = false;
    this._lastPickedIndex = -1;
    this._fallbackTried = false;
    this.world = null;

    // Focus & visibility loss tracking (Yandex Games requirement: mute on blur)
    this._focusListenersAttached = false;
    this._isMutedByLossOfFocus = false;
    this._audioCtxWasRunning = false;
    this._bgmWasPlayingBeforeBlur = false;
    this._setupFocusListeners();
  }

  // =========================================================================
  // BACKGROUND MUSIC (BGM) DUAL-PLAYER CROSSFADE PIPELINE
  // =========================================================================

  get bgmAudio() {
    return this._getActiveAudio();
  }

  _getActiveAudio() {
    return this.activePlayerKey === 'A' ? this.playerA : this.playerB;
  }

  _getInactiveAudio() {
    return this.activePlayerKey === 'A' ? this.playerB : this.playerA;
  }

  _getTargetBgmVolume() {
    if (this.bgmMuted || this.bgmVolumeFactor <= 0) return 0;
    return this.baseBgmVolume * this.bgmVolumeFactor;
  }

  _getNextRandomTrackIndex() {
    if (!this.tracks || this.tracks.length === 0) return 0;
    if (this.tracks.length === 1) return 0;

    // With 2 tracks, strictly alternate so neither ever repeats twice in a row
    if (this.tracks.length === 2) {
      const next = this.currentTrackIndex === 0 ? 1 : 0;
      this._lastPickedIndex = next;
      return next;
    }

    // With 3+ tracks, use shuffle bag without back-to-back repeats
    const lastIdx = this._lastPickedIndex !== -1 ? this._lastPickedIndex : this.currentTrackIndex;
    if (this._shuffledQueue.length === 0) {
      const indices = this.tracks.map((_, i) => i);
      for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
      }
      if (indices[0] === lastIdx && indices.length > 1) {
        const swapIdx = Math.floor(Math.random() * (indices.length - 1)) + 1;
        [indices[0], indices[swapIdx]] = [indices[swapIdx], indices[0]];
      }
      this._shuffledQueue = indices;
    }
    const next = this._shuffledQueue.shift();
    this._lastPickedIndex = next;
    return next;
  }

  _initBGM() {
    if (this.playerA || typeof Audio === 'undefined') return;

    this.playerA = new Audio();
    this.playerA.preload = 'auto';
    this.playerA.loop = false;

    this.playerB = new Audio();
    this.playerB.preload = 'auto';
    this.playerB.loop = false;

    this._setupPlayerEvents(this.playerA, 'A');
    this._setupPlayerEvents(this.playerB, 'B');

    if (this.currentTrackIndex === -1) {
      this.currentTrackIndex = Math.floor(Math.random() * this.tracks.length);
      this._lastPickedIndex = this.currentTrackIndex;
    }
    this.playerA.src = this.tracks[this.currentTrackIndex];
    this._updateBgmVolume();
  }

  _setupPlayerEvents(player, key) {
    // Crossfade trigger near track ending
    player.addEventListener('timeupdate', () => {
      if (this.activePlayerKey !== key) return;
      if (this._isCrossfading) return;
      if (!this.isPlayingBGM || this.bgmMuted || this.bgmVolumeFactor <= 0) return;
      if (this.world && (this.world.inMenu || this.world.isPaused)) return;

      if (player.duration && player.duration > 0 && player.currentTime > 0) {
        const timeLeft = player.duration - player.currentTime;
        if (timeLeft <= this._crossfadeDuration && timeLeft > 0) {
          this._startCrossfade(false);
        }
      }
    });

    // Fallback if crossfade didn't trigger (e.g. unknown duration or sudden end)
    player.addEventListener('ended', () => {
      if (this.activePlayerKey === key) {
        this._startCrossfade(true);
      }
    });

    // Path traversal fallback
    player.addEventListener('error', () => {
      if (!this._fallbackTried) {
        this._fallbackTried = true;
        this.tracks = this.tracks.map(t => t.startsWith('../') ? t.slice(3) : '../' + t);
        const active = this._getActiveAudio();
        if (active && this.isPlayingBGM && !this.bgmMuted) {
          active.src = this.tracks[this.currentTrackIndex];
          if (!this.world || (!this.world.inMenu && !this.world.isPaused)) {
            active.play().catch(() => {});
          }
        }
      }
    });
  }

  _startCrossfade(immediate = false) {
    if (this._isCrossfading) return;
    if (this.world && this.world.inMenu) return; // Strict: no BGM in main menu

    this._isCrossfading = true;
    const currentAudio = this._getActiveAudio();
    const nextKey = this.activePlayerKey === 'A' ? 'B' : 'A';
    const nextAudio = nextKey === 'A' ? this.playerA : this.playerB;

    this.currentTrackIndex = this._getNextRandomTrackIndex();
    nextAudio.src = this.tracks[this.currentTrackIndex];
    try { nextAudio.currentTime = 0; } catch (e) {}

    const targetVol = this._getTargetBgmVolume();

    if (immediate) {
      if (this._crossfadeInterval) {
        clearInterval(this._crossfadeInterval);
        this._crossfadeInterval = null;
      }
      if (currentAudio) {
        currentAudio.pause();
        try { currentAudio.currentTime = 0; } catch (e) {}
        currentAudio.volume = 0;
      }

      nextAudio.volume = targetVol;
      this.activePlayerKey = nextKey;
      this._isCrossfading = false;
      this._crossfadeProgress = 0;

      if (this.isPlayingBGM && !this.bgmMuted && this.bgmVolumeFactor > 0) {
        if (!this.world || (!this.world.isPaused && !this.world.inMenu)) {
          nextAudio.play().catch(() => {});
        }
      }
      return;
    }

    nextAudio.volume = 0;
    if (this.isPlayingBGM && !this.bgmMuted && this.bgmVolumeFactor > 0) {
      if (!this.world || (!this.world.isPaused && !this.world.inMenu)) {
        const p = nextAudio.play();
        if (p !== undefined) p.catch(() => {});
      }
    }

    const startTime = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const durationMs = this._crossfadeDuration * 1000;

    if (this._crossfadeInterval) {
      clearInterval(this._crossfadeInterval);
      this._crossfadeInterval = null;
    }

    this._crossfadeInterval = setInterval(() => {
      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      const elapsed = now - startTime;
      const progress = Math.min(1, Math.max(0, elapsed / durationMs));
      this._crossfadeProgress = progress;

      const curTarget = this._getTargetBgmVolume();
      // Equal-power crossfade curve for constant perceived loudness
      const outVol = curTarget * Math.cos(progress * 0.5 * Math.PI);
      const inVol = curTarget * Math.sin(progress * 0.5 * Math.PI);

      if (currentAudio) {
        currentAudio.volume = Math.max(0, Math.min(1, outVol));
      }
      if (nextAudio) {
        nextAudio.volume = Math.max(0, Math.min(1, inVol));
      }

      if (progress >= 1) {
        clearInterval(this._crossfadeInterval);
        this._crossfadeInterval = null;

        if (currentAudio) {
          currentAudio.pause();
          try { currentAudio.currentTime = 0; } catch (e) {}
          currentAudio.volume = 0;
        }

        nextAudio.volume = curTarget;
        this.activePlayerKey = nextKey;
        this._isCrossfading = false;
        this._crossfadeProgress = 0;
      }
    }, 40);
  }

  _updateBgmVolume() {
    const targetVol = this._getTargetBgmVolume();
    const active = this._getActiveAudio();
    const other = this._getInactiveAudio();

    if (!this._isCrossfading) {
      if (active) {
        active.volume = Math.max(0, Math.min(1, targetVol));
        active.muted = this.bgmMuted || this.bgmVolumeFactor === 0;
      }
      if (other) {
        other.volume = 0;
        other.muted = this.bgmMuted || this.bgmVolumeFactor === 0;
      }
    } else {
      const p = this._crossfadeProgress;
      const outVol = targetVol * Math.cos(p * 0.5 * Math.PI);
      const inVol = targetVol * Math.sin(p * 0.5 * Math.PI);
      if (active) {
        active.volume = Math.max(0, Math.min(1, outVol));
        active.muted = this.bgmMuted || this.bgmVolumeFactor === 0;
      }
      if (other) {
        other.volume = Math.max(0, Math.min(1, inVol));
        other.muted = this.bgmMuted || this.bgmVolumeFactor === 0;
      }
    }
  }

  startBGM() {
    this._initBGM();
    // In main menu BGM must NOT play!
    if (this.world && this.world.inMenu) return;

    this.isPlayingBGM = true;
    if (this.bgmMuted || this.bgmVolumeFactor <= 0) return;
    if (this.world && this.world.isPaused) return;

    const active = this._getActiveAudio();
    if (active && active.paused) {
      active.volume = this._getTargetBgmVolume();
      const playPromise = active.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            this.isBgmUnlocked = true;
            if (this.world) this.world.eventBus.emit('AUDIO_UNLOCKED');
          })
          .catch(() => {});
      }
    }
  }

  restartBGM() {
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    if (this._lastRestartTime && (now - this._lastRestartTime < 100)) {
      return;
    }
    this._lastRestartTime = now;

    this._initBGM();
    // In main menu BGM must NOT play!
    if (this.world && this.world.inMenu) return;

    if (this._crossfadeInterval) {
      clearInterval(this._crossfadeInterval);
      this._crossfadeInterval = null;
    }
    this._isCrossfading = false;
    this._crossfadeProgress = 0;

    if (this.playerA) {
      this.playerA.pause();
      try { this.playerA.currentTime = 0; } catch (e) {}
      this.playerA.volume = 0;
    }
    if (this.playerB) {
      this.playerB.pause();
      try { this.playerB.currentTime = 0; } catch (e) {}
      this.playerB.volume = 0;
    }

    // Pick a random track strictly from the beginning
    this.activePlayerKey = 'A';
    this.currentTrackIndex = Math.floor(Math.random() * this.tracks.length);
    this._lastPickedIndex = this.currentTrackIndex;
    if (this.playerA) {
      this.playerA.src = this.tracks[this.currentTrackIndex];
      this.playerA.volume = this._getTargetBgmVolume();
    }

    this.isPlayingBGM = true;
    if (this.bgmMuted || this.bgmVolumeFactor <= 0) return;
    if (this.world && this.world.isPaused) return;

    if (this.playerA) {
      const playPromise = this.playerA.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            this.isBgmUnlocked = true;
            if (this.world) this.world.eventBus.emit('AUDIO_UNLOCKED');
          })
          .catch(() => {});
      }
    }
  }

  pauseBGM() {
    this.isPlayingBGM = false;
    if (this.playerA) this.playerA.pause();
    if (this.playerB) this.playerB.pause();
  }

  resumeBGM() {
    // In main menu BGM must NOT play!
    if (this.world && this.world.inMenu) return;
    if (this.world && this.world.isPaused) return;
    if (this.bgmMuted || this.bgmVolumeFactor <= 0) return;

    this.isPlayingBGM = true;
    this._initBGM();
    const active = this._getActiveAudio();
    if (active && active.paused) {
      active.play().catch(() => {});
    }
    if (this._isCrossfading) {
      const other = this._getInactiveAudio();
      if (other && other.paused) {
        other.play().catch(() => {});
      }
    }
  }

  // =========================================================================
  // VOLUME & MUTE CONTROLS
  // =========================================================================

  // SFX Channel
  cycleSfxVolume() {
    const levels = [1.0, 0.6, 0.3, 0.0];
    const currentIndex = levels.findIndex(lvl => Math.abs(lvl - this.sfxVolume) < 0.05);
    const nextIndex = (currentIndex + 1) % levels.length;
    this.sfxVolume = levels[nextIndex];
    this.sfxMuted = this.sfxVolume === 0;
    this._updateSfxGain();
    this.unlockAudio();
    return this.getSfxLabel();
  }

  toggleSfxMute() {
    this.sfxMuted = !this.sfxMuted;
    if (!this.sfxMuted && this.sfxVolume === 0) {
      this.sfxVolume = 1.0;
    }
    this._updateSfxGain();
    this.unlockAudio();
    return this.getSfxLabel();
  }

  getSfxLabel() {
    if (this.sfxMuted || this.sfxVolume === 0) {
      return { icon: '🔇', text: 'ЗВУК ВЫКЛ', title: 'Звуки игры: ВЫКЛ (Клик: изменить громкость, ПКМ: вкл)', isMuted: true };
    }
    const pct = Math.round(this.sfxVolume * 100);
    const icon = pct > 70 ? '🔊' : (pct > 30 ? '🔉' : '🔈');
    const text = pct === 100 ? 'ЗВУК' : `ЗВУК ${pct}%`;
    return { icon, text, title: `Звуки игры: ${pct}% (Клик: изменить громкость, ПКМ: выкл)`, isMuted: false };
  }

  _updateSfxGain() {
    if (this.sfxMasterGain && this.audioCtx) {
      const isMuted = this.sfxMuted || this._isMutedByLossOfFocus || (typeof document !== 'undefined' && document.hidden);
      const effectiveGain = isMuted ? 0 : this.sfxVolume;
      try {
        this.sfxMasterGain.gain.cancelScheduledValues(this.audioCtx.currentTime);
        this.sfxMasterGain.gain.setValueAtTime(effectiveGain, this.audioCtx.currentTime);
      } catch (e) {}
    }
  }

  // Music Channel
  cycleBgmVolume() {
    const levels = [1.0, 0.6, 0.3, 0.0];
    const currentIndex = levels.findIndex(lvl => Math.abs(lvl - this.bgmVolumeFactor) < 0.05);
    const nextIndex = (currentIndex + 1) % levels.length;
    this.bgmVolumeFactor = levels[nextIndex];
    this.bgmMuted = this.bgmVolumeFactor === 0;
    this._updateBgmVolume();
    this.unlockAudio();
    return this.getBgmLabel();
  }

  toggleBgmMute() {
    this.bgmMuted = !this.bgmMuted;
    if (!this.bgmMuted && this.bgmVolumeFactor === 0) {
      this.bgmVolumeFactor = 1.0;
    }
    this._updateBgmVolume();
    this.unlockAudio();
    return this.getBgmLabel();
  }

  getBgmLabel() {
    if (this.bgmMuted || this.bgmVolumeFactor === 0) {
      return { icon: '🔇', text: 'МУЗЫКА ВЫКЛ', title: 'Фоновая музыка: ВЫКЛ (Клик: включить, ПКМ: вкл)', isMuted: true };
    }
    const pct = Math.round(this.bgmVolumeFactor * 100);
    const icon = pct > 50 ? '🎵' : '🎶';
    const text = pct === 100 ? 'МУЗЫКА' : `МУЗЫКА ${pct}%`;
    return { icon, text, title: `Фоновая музыка: ${pct}% (Клик: изменить громкость, ПКМ: выкл)`, isMuted: false };
  }

  // Master toggle (backward compatibility)
  toggleMute() {
    const shouldMute = !(this.sfxMuted && this.bgmMuted);
    this.sfxMuted = shouldMute;
    this.bgmMuted = shouldMute;
    this._updateSfxGain();
    this._updateBgmVolume();
    return shouldMute;
  }

  // =========================================================================
  // GLOBAL AUDIO CONTEXT & AUTOPLAY UNLOCK
  // =========================================================================

  _setupGlobalUnlockListeners() {
    if (this._windowListenersAttached || typeof window === 'undefined') return;
    this._windowListenersAttached = true;

    this._unlockHandler = () => {
      this.unlockAudio();
    };

    this._unlockEvents = ['pointerdown', 'mousedown', 'keydown', 'touchstart', 'click', 'focus', 'mousemove', 'pointermove', 'wheel'];
    this._unlockEvents.forEach(evt => {
      window.addEventListener(evt, this._unlockHandler, { capture: true, passive: true });
      document.addEventListener(evt, this._unlockHandler, { capture: true, passive: true });
    });
  }

  _cleanupUnlockListeners() {
    if (!this._windowListenersAttached || !this._unlockHandler || typeof window === 'undefined') return;
    this._unlockEvents?.forEach(evt => {
      window.removeEventListener(evt, this._unlockHandler, { capture: true });
      document.removeEventListener(evt, this._unlockHandler, { capture: true });
    });
    this._windowListenersAttached = false;
  }

  unlockAudio() {
    if (this._isMutedByLossOfFocus || (typeof document !== 'undefined' && document.hidden)) return;
    this._ensureAudioContext();

    // Do NOT play/start BGM while in main menu
    if (this.world && this.world.inMenu) {
      if (this.world) this.world.eventBus.emit('AUDIO_UNLOCKED');
      return;
    }

    if (this.isPlayingBGM && !this.bgmMuted && this.bgmAudio) {
      if (this.world && this.world.isPaused) return;
      if (this.bgmAudio.paused) {
        this.bgmAudio.play()
          .then(() => {
            this.isBgmUnlocked = true;
            if (this.world) this.world.eventBus.emit('AUDIO_UNLOCKED');
            this._cleanupUnlockListeners();
          })
          .catch(() => {});
      } else {
        this.isBgmUnlocked = true;
        if (this.world) this.world.eventBus.emit('AUDIO_UNLOCKED');
        this._cleanupUnlockListeners();
      }
    } else {
      if (this.world) this.world.eventBus.emit('AUDIO_UNLOCKED');
    }
  }

  _ensureAudioContext() {
    if (typeof window === 'undefined') return null;
    const isDocHidden = typeof document !== 'undefined' && document.hidden;
    const isMuted = this._isMutedByLossOfFocus || isDocHidden;

    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
        this.sfxMasterGain = this.audioCtx.createGain();
        const effectiveGain = (this.sfxMuted || isMuted) ? 0 : this.sfxVolume;
        this.sfxMasterGain.gain.setValueAtTime(effectiveGain, this.audioCtx.currentTime);
        this.sfxMasterGain.connect(this.audioCtx.destination);
      }
    }

    // CRITICAL: NEVER auto-resume if focus is lost or document is hidden!
    if (!isMuted && this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }

    if (this.sfxMasterGain && this.audioCtx) {
      const effectiveGain = (this.sfxMuted || isMuted) ? 0 : this.sfxVolume;
      try {
        this.sfxMasterGain.gain.setValueAtTime(effectiveGain, this.audioCtx.currentTime);
      } catch (e) {}
    }

    // Return null if muted by loss of focus so sound generators abort immediately
    return isMuted ? null : this.audioCtx;
  }

  _getSfxDestination(ctx) {
    if (!this.sfxMasterGain && ctx) {
      this.sfxMasterGain = ctx.createGain();
      const effectiveGain = this.sfxMuted ? 0 : this.sfxVolume;
      this.sfxMasterGain.gain.setValueAtTime(effectiveGain, ctx.currentTime);
      this.sfxMasterGain.connect(ctx.destination);
    }
    return this.sfxMasterGain || ctx.destination;
  }

  // =========================================================================
  // TAB FOCUS & VISIBILITY LOSS MUTE (YANDEX GAMES COMPLIANCE)
  // =========================================================================

  _setupFocusListeners() {
    if (this._focusListenersAttached || typeof window === 'undefined') return;
    this._focusListenersAttached = true;

    this._onFocusLost = () => {
      this._handleLossOfFocus();
    };

    this._onFocusGained = () => {
      this._handleGainOfFocus();
    };

    // Tab visibility changes (switching tabs, minimizing browser)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this._handleLossOfFocus();
      } else {
        this._handleGainOfFocus();
      }
    });

    // Window focus / blur (clicking outside iframe, interstitial ad modals)
    window.addEventListener('blur', this._onFocusLost);
    window.addEventListener('focus', this._onFocusGained);

    // Page hide / show (mobile navigation, app switcher)
    window.addEventListener('pagehide', this._onFocusLost);
    window.addEventListener('pageshow', this._onFocusGained);
  }

  _handleLossOfFocus() {
    this._isMutedByLossOfFocus = true;

    // 1. Immediately zero the master SFX gain to silence any ongoing or in-flight sounds
    if (this.sfxMasterGain && this.audioCtx) {
      try {
        this.sfxMasterGain.gain.cancelScheduledValues(this.audioCtx.currentTime);
        this.sfxMasterGain.gain.setValueAtTime(0, this.audioCtx.currentTime);
      } catch (e) {}
    }

    // 2. Suspend Web Audio API to freeze timeline and prevent procedural synthesis
    if (this.audioCtx) {
      if (this.audioCtx.state === 'running') {
        this._audioCtxWasRunning = true;
      }
      this.audioCtx.suspend().catch(() => {});
    }

    // 3. Pause background music if currently playing
    const active = this._getActiveAudio();
    const other = this._getInactiveAudio();
    const isPlaying = (active && !active.paused) || (other && !other.paused);
    if (isPlaying) {
      this._bgmWasPlayingBeforeBlur = true;
      if (active) active.pause();
      if (other) other.pause();
    }
  }

  _handleGainOfFocus() {
    // If the document is still hidden, keep muted
    if (typeof document !== 'undefined' && document.hidden) return;
    if (!this._isMutedByLossOfFocus) return;
    this._isMutedByLossOfFocus = false;

    // 1. Restore SFX master gain
    if (this.sfxMasterGain && this.audioCtx) {
      try {
        const effectiveGain = this.sfxMuted ? 0 : this.sfxVolume;
        this.sfxMasterGain.gain.cancelScheduledValues(this.audioCtx.currentTime);
        this.sfxMasterGain.gain.setValueAtTime(effectiveGain, this.audioCtx.currentTime);
      } catch (e) {}
    }

    // 2. Resume Web Audio API
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    this._audioCtxWasRunning = false;

    // 3. Resume BGM only if it was playing before blur and game is not paused / not muted / not in menu
    if (this._bgmWasPlayingBeforeBlur && this.isPlayingBGM && !this.bgmMuted && this.bgmVolumeFactor > 0) {
      if (!this.world || (!this.world.isPaused && !this.world.inMenu)) {
        const active = this._getActiveAudio();
        if (active && active.paused) {
          active.play().catch(() => {});
        }
        if (this._isCrossfading) {
          const other = this._getInactiveAudio();
          if (other && other.paused) {
            other.play().catch(() => {});
          }
        }
      }
    }
    this._bgmWasPlayingBeforeBlur = false;
  }

  _canPlaySfx() {
    if (this._isMutedByLossOfFocus) return false;
    if (typeof document !== 'undefined' && document.hidden) return false;
    if (this.sfxMuted || this.sfxVolume === 0) return false;
    return true;
  }

  // Explicit ad playback hooks for Yandex Games SDK
  pauseForAd() {
    this._handleLossOfFocus();
  }

  resumeAfterAd() {
    this._handleGainOfFocus();
  }

  init(world) {
    this.world = world;
    this._setupFocusListeners();
    this._initBGM();
    // Do NOT call this.startBGM() here! In main menu BGM must NOT play until gameplay starts.

    // Attach comprehensive unlock listeners so any early interaction starts sound immediately
    this._setupGlobalUnlockListeners();

    // Event bus subscriptions
    world.eventBus.on('PAUSE_TOGGLED', (event) => {
      if (event.isPaused) {
        this.pauseBGM();
      } else {
        if (!world.inMenu && !world.isGameOver) {
          this.resumeBGM();
        }
      }
    });

    world.eventBus.on('PROJECTILE_FIRED', (event) => {
      this.playLaserSound(event.isCrit);
    });

    world.eventBus.on('DAMAGE_DEALT', (event) => {
      if (event.isCrit) {
        this.playCritSound();
      } else {
        this.playHitSound();
      }
    });

    world.eventBus.on('ENTITY_DIED', (event) => {
      this.playExplosionSound(event.enemyType);
    });

    world.eventBus.on('UPGRADE_PURCHASED', () => {
      this.playUpgradeSound();
    });

    world.eventBus.on('WAVE_STARTED', () => {
      this.playWaveAlertSound();
      // Ensure BGM plays right at the start of gameplay when enemies begin flying
      if (!this.bgmMuted && (!this.bgmAudio || this.bgmAudio.paused)) {
        if (!world.isPaused && !world.isGameOver && !world.inMenu) {
          this.startBGM();
        }
      }
    });

    world.eventBus.on('WAVE_COMPLETED', () => {
      this.playWaveClearSound();
    });

    world.eventBus.on('GAME_OVER', () => {
      this.playGameOverSound();
      this.pauseBGM();
    });

    world.eventBus.on('RESTART_GAME', () => {
      this.restartBGM();
    });

    world.eventBus.on('BLINKER_DASH', () => {
      this.playBlinkerDashSound();
    });
  }

  update(world, deltaTime) {
    // Audio is event-driven; no frame update required
  }

  // =========================================================================
  // SYNTHESIZED SOUND GENERATORS (SFX)
  // =========================================================================

  playLaserSound(isCrit) {
    if (!this._canPlaySfx()) return;
    const ctx = this._ensureAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = isCrit ? 'sawtooth' : 'sine';
    const startFreq = isCrit ? 920 : 680;
    const endFreq = isCrit ? 220 : 180;

    osc.frequency.setValueAtTime(startFreq, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(endFreq, ctx.currentTime + 0.08);

    gain.gain.setValueAtTime(isCrit ? 0.08 : 0.05, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);

    osc.connect(gain);
    gain.connect(this._getSfxDestination(ctx));

    osc.start();
    osc.stop(ctx.currentTime + 0.08);
  }

  playHitSound() {
    if (!this._canPlaySfx()) return;
    const ctx = this._ensureAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(320, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(90, ctx.currentTime + 0.04);

    gain.gain.setValueAtTime(0.03, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);

    osc.connect(gain);
    gain.connect(this._getSfxDestination(ctx));

    osc.start();
    osc.stop(ctx.currentTime + 0.04);
  }

  playCritSound() {
    if (!this._canPlaySfx()) return;
    const ctx = this._ensureAudioContext();
    if (!ctx) return;

    // Dual-tone harmonic chime
    [1200, 1600].forEach((freq) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.2, ctx.currentTime + 0.12);

      gain.gain.setValueAtTime(0.06, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);

      osc.connect(gain);
      gain.connect(this._getSfxDestination(ctx));

      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    });
  }

  playExplosionSound(enemyType) {
    if (!this._canPlaySfx()) return;
    const ctx = this._ensureAudioContext();
    if (!ctx) return;

    const bufferSize = Math.floor(ctx.sampleRate * 0.2);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    const isHeavy = enemyType === 'tank';
    filter.frequency.setValueAtTime(isHeavy ? 350 : 600, ctx.currentTime);
    filter.frequency.linearRampToValueAtTime(60, ctx.currentTime + 0.2);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(isHeavy ? 0.18 : 0.10, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this._getSfxDestination(ctx));

    noise.start();
    noise.stop(ctx.currentTime + 0.2);
  }

  playUpgradeSound() {
    if (!this._canPlaySfx()) return;
    const ctx = this._ensureAudioContext();
    if (!ctx) return;

    // Ascending arpeggio
    const notes = [440, 554, 659];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      const startTime = ctx.currentTime + idx * 0.05;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.06, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.1);

      osc.connect(gain);
      gain.connect(this._getSfxDestination(ctx));

      osc.start(startTime);
      osc.stop(startTime + 0.1);
    });
  }

  playWaveAlertSound() {
    if (!this._canPlaySfx()) return;
    const ctx = this._ensureAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(440, ctx.currentTime);
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.09);

    gain.gain.setValueAtTime(0.05, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);

    osc.connect(gain);
    gain.connect(this._getSfxDestination(ctx));

    osc.start();
    osc.stop(ctx.currentTime + 0.22);
  }

  playWaveClearSound() {
    if (!this._canPlaySfx()) return;
    const ctx = this._ensureAudioContext();
    if (!ctx) return;

    [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      const startTime = ctx.currentTime + idx * 0.06;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.06, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.15);

      osc.connect(gain);
      gain.connect(this._getSfxDestination(ctx));

      osc.start(startTime);
      osc.stop(startTime + 0.15);
    });
  }

  playGameOverSound() {
    if (!this._canPlaySfx()) return;
    const ctx = this._ensureAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(260, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.8);

    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);

    osc.connect(gain);
    gain.connect(this._getSfxDestination(ctx));

    osc.start();
    osc.stop(ctx.currentTime + 0.8);
  }

  playBlinkerDashSound() {
    if (!this._canPlaySfx()) return;
    const ctx = this._ensureAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(950, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(180, ctx.currentTime + 0.14);

    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.14);

    osc.connect(gain);
    gain.connect(this._getSfxDestination(ctx));

    osc.start();
    osc.stop(ctx.currentTime + 0.14);
  }
}
