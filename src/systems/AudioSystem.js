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
    this.currentTrackIndex = 0;
    this.bgmAudio = null;
    this.isPlayingBGM = false;
    this.isBgmUnlocked = false;

    this._windowListenersAttached = false;
    this._fallbackTried = false;
    this.world = null;
  }

  // =========================================================================
  // BACKGROUND MUSIC (BGM) PIPELINE
  // =========================================================================

  _initBGM() {
    if (this.bgmAudio || typeof Audio === 'undefined') return;

    this.bgmAudio = new Audio();
    this.bgmAudio.preload = 'auto';
    this.bgmAudio.loop = false; // Alternated on 'ended' event
    this._updateBgmVolume();

    // Alternate tracks on track end and loop indefinitely
    this.bgmAudio.addEventListener('ended', () => {
      this.currentTrackIndex = (this.currentTrackIndex + 1) % this.tracks.length;
      this._loadAndPlayTrack();
    });

    // Fallback if relative path requires traversal (e.g. launched from subfolder)
    this.bgmAudio.addEventListener('error', () => {
      if (!this._fallbackTried) {
        this._fallbackTried = true;
        this.tracks = this.tracks.map(t => t.startsWith('../') ? t.slice(3) : '../' + t);
        this._loadAndPlayTrack();
      }
    });

    this._loadTrack(this.currentTrackIndex);
  }

  _loadTrack(index) {
    if (!this.bgmAudio) return;
    this.bgmAudio.src = this.tracks[index];
    this._updateBgmVolume();
  }

  _loadAndPlayTrack() {
    this._loadTrack(this.currentTrackIndex);
    if (!this.bgmMuted && this.isPlayingBGM && this.bgmAudio) {
      this.bgmAudio.play().catch(() => {});
    }
  }

  _updateBgmVolume() {
    if (!this.bgmAudio) return;
    const effectiveVol = this.bgmMuted ? 0 : (this.baseBgmVolume * this.bgmVolumeFactor);
    this.bgmAudio.volume = Math.max(0, Math.min(1, effectiveVol));
    this.bgmAudio.muted = this.bgmMuted || this.bgmVolumeFactor === 0;

    if (!this.bgmMuted && this.bgmVolumeFactor > 0 && this.isPlayingBGM && this.bgmAudio.paused) {
      this.bgmAudio.play().catch(() => {});
    }
  }

  startBGM() {
    this._initBGM();
    this.isPlayingBGM = true;
    if (this.bgmMuted || !this.bgmAudio) return;

    const playPromise = this.bgmAudio.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          this.isBgmUnlocked = true;
          if (this.world) this.world.eventBus.emit('AUDIO_UNLOCKED');
        })
        .catch(() => {
          // Autoplay policy: start silently on first user hover/move/interaction without any banners
        });
    }
  }

  pauseBGM() {
    this.isPlayingBGM = false;
    if (this.bgmAudio) {
      this.bgmAudio.pause();
    }
  }

  resumeBGM() {
    this.isPlayingBGM = true;
    if (this.bgmMuted || this.bgmVolumeFactor <= 0) return;
    this._initBGM();
    if (this.bgmAudio) {
      this.bgmAudio.play().catch(() => {});
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
      const effectiveGain = this.sfxMuted ? 0 : this.sfxVolume;
      this.sfxMasterGain.gain.setValueAtTime(effectiveGain, this.audioCtx.currentTime);
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
    this._ensureAudioContext();
    if (this.isPlayingBGM && !this.bgmMuted && this.bgmAudio) {
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
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
        this.sfxMasterGain = this.audioCtx.createGain();
        const effectiveGain = this.sfxMuted ? 0 : this.sfxVolume;
        this.sfxMasterGain.gain.setValueAtTime(effectiveGain, this.audioCtx.currentTime);
        this.sfxMasterGain.connect(this.audioCtx.destination);
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    if (this.sfxMasterGain && this.audioCtx) {
      const effectiveGain = this.sfxMuted ? 0 : this.sfxVolume;
      this.sfxMasterGain.gain.setValueAtTime(effectiveGain, this.audioCtx.currentTime);
    }
    return this.audioCtx;
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

  init(world) {
    this.world = world;
    this._initBGM();
    this.startBGM();

    // Attach comprehensive unlock listeners so any early interaction starts sound immediately
    this._setupGlobalUnlockListeners();

    // Event bus subscriptions
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
        this.startBGM();
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
      this.resumeBGM();
    });
  }

  update(world, deltaTime) {
    // Audio is event-driven; no frame update required
  }

  // =========================================================================
  // SYNTHESIZED SOUND GENERATORS (SFX)
  // =========================================================================

  playLaserSound(isCrit) {
    if (this.sfxMuted || this.sfxVolume === 0) return;
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
    if (this.sfxMuted || this.sfxVolume === 0) return;
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
    if (this.sfxMuted || this.sfxVolume === 0) return;
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
    if (this.sfxMuted || this.sfxVolume === 0) return;
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
    if (this.sfxMuted || this.sfxVolume === 0) return;
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
    if (this.sfxMuted || this.sfxVolume === 0) return;
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
    if (this.sfxMuted || this.sfxVolume === 0) return;
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
    if (this.sfxMuted || this.sfxVolume === 0) return;
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
}
