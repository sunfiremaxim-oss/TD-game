import { GameConfig } from '../config/GameConfig.js';
import { getStage } from '../config/StageConfig.js';
import { DevControlComponent } from '../components/DevControlComponent.js';
import { TowerComponent } from '../components/TowerComponent.js';
import { HealthComponent } from '../components/HealthComponent.js';
import { EconomyComponent } from '../components/EconomyComponent.js';
import { EnemyComponent } from '../components/EnemyComponent.js';
import { ProjectileComponent } from '../components/ProjectileComponent.js';
import { TransformComponent } from '../components/TransformComponent.js';
import { TargetComponent } from '../components/TargetComponent.js';
import { AttackComponent } from '../components/AttackComponent.js';
import { i18n, t } from '../i18n/I18n.js';

export const DEV_DESKTOP_QUERY = '(min-width: 1101px) and (min-height: 601px) and (hover: hover) and (pointer: fine)';
const DEV_ENEMIES = {
  scout: 'СКАУТ', fighter: 'ИСТРЕБИТЕЛЬ', tank: 'ТАНК', sniper: 'СНАЙПЕР',
  aegis: 'ПЕНТАГОН «ЭГИДА»', splitter: 'ФРАКТАЛ «СПЛИТТЕР»',
  blinker: 'ВЕКТОР «БЛИНКЕР»', boss_scout: 'БОСС «ИМПУЛЬС»', boss_architect: 'БОСС «МОНОЛИТ»', boss_carrier: 'БОСС «ДИРИЖЁР»', boss_railgun: 'БОСС «ПАРАЛЛАКС»'
};

/** Temporary desktop rail. Cheats are session-only; progress reset is explicit. */
export class DevTools {
  constructor(app) {
    this.app = app;
    this.world = app.world;
    this.flags = new DevControlComponent();
    this.world.addComponent(this._tower(), this.flags);
    this.desktop = window.matchMedia(DEV_DESKTOP_QUERY);
    this.root = document.getElementById('game-app');
    this.collapsed = false;
    this._shown = false;
    this._nextRefresh = 0;
    this.element = document.createElement('aside');
    this.element.id = 'devtools';
    this.element.setAttribute('data-scrollable', '');
    const text = key => `<span data-dev-text="${key}">${t(key)}</span>`;
    const button = (action, key) => `<button type="button" data-dev-action="${action}">${text(key)}</button>`;
    this.element.innerHTML = `
      <header class="dev-header"><strong>DEVTOOLS</strong><button id="dev-collapse" type="button">‹</button></header>
      <div class="dev-body" data-scrollable>
        <output class="dev-status" id="dev-status"></output>
        <fieldset><legend>${text('Симуляция')}</legend>
          <div class="dev-row"><button id="dev-pause" data-dev-action="pause" type="button"></button>${button('step', 'Шаг 1/60 с')}</div>
          <label>${text('Скорость')}<select id="dev-speed" aria-label="${t('Скорость')}">${[0.25, 0.5, 1, 2, 3].map(v => `<option value="${v}"${v === 1 ? ' selected' : ''}>${v}×</option>`).join('')}</select></label>
          <label><input id="dev-invulnerable" type="checkbox">${text('Бессмертие')}</label>
          <label><input id="dev-fire" type="checkbox" checked>${text('Огонь башни')}</label>
          <label><input id="dev-waves" type="checkbox" checked>${text('Автоволны')}</label>
        </fieldset>
        <fieldset><legend>${text('Текущий бой')}</legend>
          <div class="dev-row">${button('heal', 'HP 100%')}${button('half-health', 'HP 50%')}</div>
          <div class="dev-row">${button('credits-small', '+1 000 ◈')}${button('credits-large', '+10 000 ◈')}</div>
          <div class="dev-row"><input id="dev-wave" type="number" min="1" max="200" step="1" value="10" aria-label="${t('Номер волны')}">${button('wave', 'Перейти к волне')}</div>
          <div class="dev-row">${button('next-wave', 'Следующая волна')}${button('clear', 'Очистить поле')}</div>
        </fieldset>
        <fieldset><legend>${text('Добавить врагов')}</legend>
          <select id="dev-enemy" aria-label="${t('Тип врага')}">${Object.entries(DEV_ENEMIES).map(([id, name]) => `<option value="${id}" data-dev-text="${name}">${t(name)}</option>`).join('')}</select>
          <div class="dev-row"><label class="dev-number">${text('Количество')}<input id="dev-count" type="number" min="1" max="50" value="1"></label>
          <label class="dev-number">${text('Дистанция, px')}<input id="dev-distance" type="number" min="80" max="1000" value="300" step="10"></label></div>
          <select id="dev-side" aria-label="${t('Сторона появления')}">${[['0', 'Справа'], ['180', 'Слева'], ['270', 'Сверху'], ['90', 'Снизу'], ['random', 'Случайно']].map(([value, name]) => `<option value="${value}" data-dev-text="${name}">${t(name)}</option>`).join('')}</select>
          <div class="dev-row">${button('spawn', 'Добавить')}</div>
        </fieldset>
        <fieldset><legend>${text('Проверка ИИ')}</legend>
          <div class="dev-row">${button('convoy', 'Танк + Истребители')}</div>
          <div class="dev-row">${button('bunker', 'Эгида + Снайперы')}</div>
          <p class="dev-note">${text('Сценарий очищает поле, отключает огонь и автоволны, включает бессмертие.')}</p>
        </fieldset>
        <fieldset><legend>${text('Прогресс')}</legend>
          <div class="dev-row">${button('reset-progress', 'Сбросить весь прогресс')}</div>
          <div class="dev-reset-confirm" hidden>
            <p class="dev-note">${text('Микрочипы, постоянные уровни, тиры и пройденные стадии будут сброшены. Текущий бой завершится.')}</p>
            <div class="dev-row">${button('confirm-reset-progress', 'Подтвердить сброс')}${button('cancel-reset-progress', 'Отмена')}</div>
          </div>
        </fieldset>
        <p class="dev-note">${text('F2 — свернуть панель')}</p>
      </div>`;
    document.getElementById('game-viewport').prepend(this.element);
    const get = id => this.element.querySelector(`#dev-${id}`);
    this.dom = Object.fromEntries(['collapse', 'pause', 'status', 'speed', 'invulnerable', 'fire', 'waves', 'wave', 'enemy', 'count', 'distance', 'side'].map(id => [id, get(id)]));
    this.body = this.element.querySelector('.dev-body');
    this.labels = [...this.element.querySelectorAll('[data-dev-text]')];
    this.controls = [...this.body.querySelectorAll('button, input, select')];
    this._onClick = event => {
      const action = event.target.closest('[data-dev-action]')?.dataset.devAction;
      if (action) this.execute(action);
    };
    this._onChange = event => {
      if (!this._canUse()) return;
      const input = event.target;
      if (input === this.dom.speed) this.setSpeed(Number(input.value));
      if (input === this.dom.invulnerable) this.flags.invulnerable = input.checked;
      if (input === this.dom.fire) this.flags.firingDisabled = !input.checked;
      if (input === this.dom.waves) {
        this.flags.wavesFrozen = !input.checked;
        if (input.checked && this.app.waveSystem.state === 'IDLE') this.app.waveSystem._startWave(this.world);
      }
      this.refresh();
    };
    this._onCollapse = () => this.toggleCollapsed();
    this._onKey = event => {
      if (event.key !== 'F2' || event.repeat || !this._shown) return;
      event.preventDefault(); this.toggleCollapsed();
    };
    this._onMedia = () => { this._syncLayout(); this.refresh(); };
    this.element.addEventListener('click', this._onClick);
    this.element.addEventListener('change', this._onChange);
    this.dom.collapse.addEventListener('click', this._onCollapse);
    document.addEventListener('keydown', this._onKey);
    this.desktop.addEventListener('change', this._onMedia);
    this._unsubscribeLanguage = i18n.onChange(() => this.translate());
    this.translate();
    this._syncLayout();
  }

  _tower() { return this.world.getEntitiesWith(TowerComponent)[0]; }
  _canUse() { return Boolean(GameConfig.devTools.enabled && this.desktop.matches && !this.world.inMenu && !this.world.isGameOver); }

  _syncLayout() {
    const shown = Boolean(GameConfig.devTools.enabled && this.desktop.matches && !this.world.inMenu);
    this.flags.enabled = shown;
    if (shown === this._shown) return;
    this._shown = shown;
    this.root.classList.toggle('devtools-mounted', shown);
    this.app._resizeCanvas();
    this.refresh();
  }

  update(timestamp) {
    this._syncLayout();
    if (!this._shown || this.collapsed || timestamp < this._nextRefresh) return;
    this._nextRefresh = timestamp + 250;
    this.refresh();
  }

  translate() {
    for (const node of this.labels) node.textContent = t(node.dataset.devText);
    this.element.setAttribute('aria-label', t('Инструменты разработчика'));
    this.dom.collapse.title = t('F2 — свернуть панель');
    this.dom.speed.setAttribute('aria-label', t('Скорость'));
    this.dom.wave.setAttribute('aria-label', t('Номер волны'));
    this.dom.enemy.setAttribute('aria-label', t('Тип врага'));
    this.dom.side.setAttribute('aria-label', t('Сторона появления'));
    this.refresh();
  }

  refresh() {
    if (!this.dom) return;
    const usable = this._canUse();
    for (const control of this.controls) control.disabled = !usable;
    this.dom.pause.textContent = t(this.world.isPaused ? 'Продолжить' : 'Пауза');
    this.dom.pause.setAttribute('aria-pressed', String(this.world.isPaused));
    this.body.querySelector('[data-dev-action="step"]').disabled = !usable || !this.world.isPaused;
    this.dom.invulnerable.checked = this.flags.invulnerable;
    this.dom.fire.checked = !this.flags.firingDisabled;
    this.dom.waves.checked = !this.flags.wavesFrozen;
    if (document.activeElement !== this.dom.speed) this.dom.speed.value = String(this.world.gameSpeed);
    const count = this._aliveCount();
    const label = t('Волна {wave} · На поле: {count}', { wave: this.app.waveSystem.currentWave, count });
    if (this.dom.status.textContent !== label) this.dom.status.textContent = label;
  }

  toggleCollapsed() {
    this.collapsed = !this.collapsed;
    this.root.classList.toggle('devtools-collapsed', this.collapsed);
    this.body.hidden = this.collapsed;
    this.element.querySelector('strong').textContent = this.collapsed ? 'DEV' : 'DEVTOOLS';
    this.dom.collapse.textContent = this.collapsed ? '›' : '‹';
    this.app._resizeCanvas();
  }

  execute(action) {
    if (!this._canUse()) return false;
    if (action === 'pause') this.app.uiManager.togglePause();
    else if (action === 'step') this.step();
    else if (action === 'heal') this.setHealth(1);
    else if (action === 'half-health') this.setHealth(0.5);
    else if (action === 'credits-small') this.addCredits(1000);
    else if (action === 'credits-large') this.addCredits(10000);
    else if (action === 'clear') this.clearField();
    else if (action === 'wave') this.jumpWave(Number(this.dom.wave.value));
    else if (action === 'next-wave') this.jumpWave(this.app.waveSystem.currentWave + 1);
    else if (action === 'spawn') this.spawn(this.dom.enemy.value, Number(this.dom.count.value), Number(this.dom.distance.value), this.dom.side.value);
    else if (action === 'convoy' || action === 'bunker') this.scenario(action);
    else if (action === 'reset-progress' || action === 'cancel-reset-progress') {
      this.element.querySelector('.dev-reset-confirm').hidden = action !== 'reset-progress';
    } else if (action === 'confirm-reset-progress') {
      if (this.element.querySelector('.dev-reset-confirm').hidden) return false;
      this.element.querySelector('.dev-reset-confirm').hidden = true;
      this.app.returnToMenu();
      this.app.playerProgress.reset();
      this.flags.invulnerable = false; this.flags.firingDisabled = false; this.flags.wavesFrozen = false;
    }
    else return false;
    this.refresh();
    return true;
  }

  setSpeed(speed) {
    if (!this._canUse() || ![0.25, 0.5, 1, 2, 3].includes(speed)) return false;
    this.world.gameSpeed = speed;
    this.app.uiManager._updatePauseButton();
    return true;
  }

  step() {
    if (!this._canUse() || !this.world.isPaused) return false;
    this.world.isPaused = false;
    try { this.world.update((1 / 60) / this.world.gameSpeed); }
    finally { this.world.isPaused = true; }
    this.app.uiManager.updateHUD();
    return true;
  }

  setHealth(fraction) {
    if (!this._canUse() || !Number.isFinite(fraction)) return false;
    const health = this.world.getComponent(this._tower(), HealthComponent);
    if (!health || health.current <= 0) return false;
    health.current = Math.max(1, Math.min(health.max, health.max * fraction));
    this.world.eventBus.emit('TOWER_HEALED', { towerId: this._tower(), healing: 0 });
    this.app.uiManager.updateHUD();
    return true;
  }

  addCredits(amount) {
    if (!this._canUse() || !Number.isSafeInteger(amount) || amount < 1 || amount > 1000000) return false;
    const economy = this.world.getComponent(this._tower(), EconomyComponent);
    if (!economy) return false;
    economy.credits = Math.min(Number.MAX_SAFE_INTEGER, economy.credits + amount);
    this.world.eventBus.emit('CREDITS_CHANGED', { credits: economy.credits, earned: amount, source: 'devtools' });
    return true;
  }

  _purge() {
    for (const id of this.world.getEntitiesWith(EnemyComponent)) this.world.destroyEntity(id);
    for (const id of this.world.getEntitiesWith(ProjectileComponent)) this.world.destroyEntity(id);
    this.world._flushDestructionQueue();
    const target = this.world.getComponent(this._tower(), TargetComponent);
    if (target) target.targetEntityId = null;
    this.app.particleSystem?.reset();
  }

  clearField() {
    if (!this._canUse()) return false;
    this._purge();
    const waves = this.app.waveSystem;
    waves.state = 'IDLE'; waves.spawnQueue.length = 0;
    waves.totalEnemiesInWave = 0; waves.enemiesSpawned = 0;
    this.flags.wavesFrozen = true;
    this.world.eventBus.emit('WAVE_STARTED', { wave: waves.currentWave, totalEnemies: 0 });
    this._progress();
    return true;
  }

  jumpWave(value) {
    if (!this._canUse() || !Number.isFinite(value)) return false;
    this._purge();
    this.flags.wavesFrozen = false;
    this.app.waveSystem.currentWave = Math.max(1, Math.min(200, Math.trunc(value)));
    // Keep late-wave stress tests available beyond the selected campaign stage.
    if (this.app.waveSystem.currentWave > (getStage(this.app.waveSystem.stageId)?.waves || Infinity)) {
      this.app.waveSystem.stageId = null;
      this.world.stageId = null;
    }
    this.app.waveSystem._startWave(this.world);
    return true;
  }

  _aliveCount() {
    return this.world.getEntitiesWith(EnemyComponent).filter(id => this.world.getComponent(id, EnemyComponent).type !== 'boss_shield').length;
  }

  _beginManualSpawn() {
    const waves = this.app.waveSystem;
    if (waves.state === 'ACTIVE') return;
    waves.state = 'ACTIVE'; waves.spawnQueue.length = 0;
    waves.totalEnemiesInWave = this._aliveCount(); waves.enemiesSpawned = waves.totalEnemiesInWave;
    this.world.eventBus.emit('WAVE_STARTED', { wave: waves.currentWave, totalEnemies: waves.totalEnemiesInWave });
  }

  _spawnAt(type, distance, angle) {
    const tower = this.world.getComponent(this._tower(), TransformComponent);
    const id = this.app.waveSystem._spawnEnemy(this.world, type);
    const transform = this.world.getComponent(id, TransformComponent);
    const x = tower.x + Math.cos(angle) * distance, y = tower.y + Math.sin(angle) * distance;
    const dx = x - transform.x, dy = y - transform.y;
    transform.x = x; transform.y = y;
    for (const shield of this.world.getComponent(id, EnemyComponent).shieldIds || []) {
      const segment = this.world.getComponent(shield, TransformComponent);
      if (segment) { segment.x += dx; segment.y += dy; }
    }
    this.app.waveSystem.totalEnemiesInWave++;
    this.app.waveSystem.enemiesSpawned++;
    return id;
  }

  _progress() {
    const waves = this.app.waveSystem;
    this.world.eventBus.emit('WAVE_PROGRESS', { wave: waves.currentWave, total: waves.totalEnemiesInWave,
      spawned: waves.enemiesSpawned, alive: this._aliveCount() });
  }

  spawn(type, count, distance, side) {
    if (!this._canUse() || !Object.hasOwn(DEV_ENEMIES, type) || !Number.isFinite(count) || !Number.isFinite(distance) ||
      !['0', '90', '180', '270', 'random'].includes(side)) return false;
    count = Math.max(1, Math.min(50, Math.trunc(count)));
    distance = Math.max(80, Math.min(1000, distance));
    this._beginManualSpawn();
    for (let i = 0; i < count; i++) {
      const angle = side === 'random' ? Math.random() * Math.PI * 2 : Number(side) * Math.PI / 180 + (i - (count - 1) / 2) * 0.12;
      this._spawnAt(type, distance, angle);
    }
    this._progress();
    return true;
  }

  scenario(kind) {
    if (!this._canUse() || !['convoy', 'bunker'].includes(kind)) return false;
    this.clearField();
    this.flags.invulnerable = true; this.flags.firingDisabled = true;
    this._beginManualSpawn();
    const range = this.world.getComponent(this._tower(), AttackComponent)?.range || GameConfig.tower.baseRange;
    const distance = Math.max(range + 45, Math.min(this.world.width, this.world.height) * 0.27);
    this._spawnAt(kind === 'convoy' ? 'tank' : 'aegis', distance, Math.PI);
    for (let i = 0; i < (kind === 'convoy' ? 3 : 2); i++) {
      this._spawnAt(kind === 'convoy' ? 'fighter' : 'sniper', distance + 70 + i * 28, Math.PI + (i - 1) * 0.08);
    }
    this._progress();
    return true;
  }

  destroy() {
    this.flags.enabled = false;
    this._unsubscribeLanguage?.();
    this.desktop.removeEventListener('change', this._onMedia);
    document.removeEventListener('keydown', this._onKey);
    this.element.removeEventListener('click', this._onClick);
    this.element.removeEventListener('change', this._onChange);
    this.dom.collapse.removeEventListener('click', this._onCollapse);
    this.element.remove();
    this.root.classList.remove('devtools-mounted', 'devtools-collapsed');
    if (this._shown) this.app._resizeCanvas();
  }
}
