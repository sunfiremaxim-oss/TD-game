import { ALL_UPGRADE_TIERS } from '../src/config/UpgradeTiers.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { EN_TRANSLATIONS } from '../src/i18n/Translations.js';
import { Localization, i18n } from '../src/i18n/I18n.js';
import { GameConfig } from '../src/config/GameConfig.js';
import { UIManager } from '../src/ui/UIManager.js';
import { UpgradeManager } from '../src/managers/UpgradeManager.js';
import { World } from '../src/core/World.js';
import { TowerComponent } from '../src/components/TowerComponent.js';
import { HealthComponent } from '../src/components/HealthComponent.js';
import { EconomyComponent } from '../src/components/EconomyComponent.js';
import { AudioSystem } from '../src/systems/AudioSystem.js';

test('all static Russian HTML text, accessibility labels and upgrade copy have English translations', async () => {
  const html = (await readFile(new URL('../index.html', import.meta.url), 'utf8')).replace(/<!--[\s\S]*?-->/g, '');
  const strings = [...html.matchAll(/>([^<>]+)</g)].map(match => match[1].trim().replace(/\s+/g, ' '));
  for (const match of html.matchAll(/(?:title|aria-label|placeholder|alt)="([^"]*)"/g)) strings.push(match[1]);
  for (const def of Object.values(GameConfig.upgrades)) strings.push(def.name, def.description || '', def.valueSuffix || '');
  const missing = [...new Set(strings.filter(source => /[А-Яа-яЁё]/.test(source) && !EN_TRANSLATIONS[source]))];
  assert.deepEqual(missing, []);
  for (const translated of Object.values(EN_TRANSLATIONS)) assert.doesNotMatch(translated, /[А-Яа-яЁё]/);
});

test('language preference persists separately from player progress and tolerates unavailable storage', () => {
  const data = new Map(), storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  data.set('cyber-core.progress.v1', 'untouched');
  const locale = new Localization(storage);
  assert.equal(locale.language, 'ru'); assert.equal(locale.setLanguage('invalid'), false);
  let calls = 0; const unsubscribe = locale.onChange(() => calls++);
  locale.toggle(); assert.equal(locale.label, 'English'); assert.equal(calls, 1);
  assert.equal(new Localization(storage).language, 'en');
  assert.equal(locale.t('Волна {wave}:', { wave: 12 }), 'Wave 12:');
  assert.equal(locale.setLanguage('en'), false); assert.equal(calls, 1);
  unsubscribe(); locale.toggle(); assert.equal(calls, 1);
  assert.equal(data.get('cyber-core.progress.v1'), 'untouched');
  const broken = new Localization({ getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } });
  assert.equal(broken.setLanguage('en'), true); assert.equal(broken.language, 'en');
});

test('switching during a paused run refreshes live UI and cards without changing health, levels or currency', () => {
  const originalDocument = globalThis.document;
  const node = () => ({ textContent: '', style: {}, attributes: {}, classList: { toggle() {} }, setAttribute(key, value) { this.attributes[key] = value; } });
  const world = new World(), tower = world.createEntity(), health = new HealthComponent(200, 380, 2.5), economy = new EconomyComponent(77);
  for (const component of [new TowerComponent(), health, economy]) world.addComponent(tower, component);
  economy.runCrystals = 9;
  Object.assign(world, { inMenu: false, isPaused: true, gameSpeed: 3 });
  const manager = new UpgradeManager({ damage: 1 }); manager.levels.set('damage', 3);
  const card = { def: GameConfig.upgrades.damage };
  for (const name of ['cardEl', 'buyBtn', 'titleEl', 'levelEl', 'currentEl', 'nextEl', 'priceEl', 'hintEl']) card[name] = node();
  const ui = Object.create(UIManager.prototype);
  Object.assign(ui, { world, upgradeManager: manager, playerProgress: null, audioSystem: null,
    permanentCardsMap: new Map(), upgradeCardsMap: new Map([['damage', card]]),
    dom: Object.fromEntries(['upgradesList', 'menuLanguage', 'battleLanguage', 'hpText', 'hpBarFill', 'creditsText', 'runCrystals',
      'crystalWallet', 'crystalBalance', 'gameOverCrystalBalance', 'waveText', 'enemyText', 'finalWaveText', 'menuFpsState',
      'btnFps', 'fpsCounter', 'intermissionText', 'abandonText', 'abandonAccept'].map(key => [key, node()])),
    crystalBalance: 150, currentWave: 12, totalEnemies: 9, enemiesAlive: 4, fpsEnabled: true,
    _pendingRunExit: 'RETURN_TO_MENU', _intermission: { nextWave: 13, remaining: 2.4 } });
  globalThis.document = { documentElement: {} };
  const unsubscribe = i18n.onChange(() => ui._refreshLanguage());
  try {
    i18n.setLanguage('en');
    assert.equal(ui.dom.menuLanguage.textContent, 'English'); assert.equal(ui.dom.battleLanguage.textContent, 'English');
    assert.equal(ui.dom.waveText.textContent, 'Wave 12:'); assert.equal(ui.dom.enemyText.textContent, 'Enemies 4');
    assert.equal(ui.dom.intermissionText.textContent, 'WAVE 13 IN: 2.4s');
    assert.match(ui.dom.abandonText.textContent, /microchips earned this run: 9/);
    assert.equal(card.titleEl.textContent, 'Damage'); assert.equal(card.levelEl.textContent, 'LV. 3');
    assert.equal(card.currentEl.textContent, '43 DMG'); assert.match(card.buyBtn.attributes['aria-label'], /10 credits/);
    assert.equal(GameConfig.upgrades.attackSpeed.format(1.6), '1.60 /s');
    assert.match(new UpgradeManager({}, ALL_UPGRADE_TIERS).getLockReason('rapidFireDuration'), /Requires: Rapid fire chance/);
    const audio = new AudioSystem(); assert.doesNotMatch(audio.getSfxLabel().title, /[А-Яа-яЁё]/);
    assert.equal(ui.upgradeCardsMap.get('damage'), card);
    assert.equal(economy.credits, 77); assert.equal(economy.runCrystals, 9); assert.equal(health.current, 200);
    assert.equal(manager.getLevel('damage'), 3); assert.equal(world.isPaused, true); assert.equal(world.gameSpeed, 3);
    i18n.setLanguage('ru');
    assert.equal(ui.dom.menuLanguage.textContent, 'Русский'); assert.equal(ui.dom.waveText.textContent, 'Волна 12:');
    assert.equal(card.titleEl.textContent, 'Урон'); assert.equal(card.levelEl.textContent, 'УР. 3');
  } finally { unsubscribe(); i18n.setLanguage('ru'); globalThis.document = originalDocument; }
});

test('static bindings translate in place and restore Russian without replacing nodes or listeners', () => {
  const locale = new Localization(null), node = { nodeValue: '  Настройки  ' };
  const button = { attributes: {}, handler() {}, setAttribute(key, value) { this.attributes[key] = value; } };
  const bindings = [{ node, source: 'Настройки', prefix: '  ', suffix: '  ' }, { node: button, attribute: 'aria-label', source: 'Настройки' }];
  const handler = button.handler;
  locale.setLanguage('en'); locale.translateDOM(bindings);
  assert.equal(node.nodeValue, '  Settings  '); assert.equal(button.attributes['aria-label'], 'Settings');
  locale.setLanguage('ru'); locale.translateDOM(bindings);
  assert.equal(node.nodeValue, '  Настройки  '); assert.equal(button.handler, handler);
});
