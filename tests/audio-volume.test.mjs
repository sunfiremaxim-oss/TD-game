import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioSystem } from '../src/systems/AudioSystem.js';
import { UIManager } from '../src/ui/UIManager.js';

function audio() {
  const system = Object.create(AudioSystem.prototype);
  Object.assign(system, { sfxVolume: 1, sfxMuted: false, baseBgmVolume: 0.38, bgmVolumeFactor: 1,
    bgmMuted: false, activePlayerKey: 'A', playerA: {}, playerB: {}, _isCrossfading: false,
    unlockAudio() {} });
  return system;
}

test('continuous SFX gain accepts arbitrary levels and preserves focus muting', () => {
  globalThis.document = { hidden: false };
  const system = audio();
  let gain;
  system.audioCtx = { currentTime: 0 };
  system.sfxMasterGain = { gain: { cancelScheduledValues() {}, setValueAtTime(value) { gain = value; } } };
  system.setSfxVolume(0.47);
  assert.equal(gain, 0.47);
  system._isMutedByLossOfFocus = true;
  system.setSfxVolume(0.23);
  assert.equal(gain, 0);
  assert.equal(system.sfxVolume, 0.23);
});

for (const channel of ['Sfx', 'Bgm']) {
  test(`${channel} volume clamps, rejects invalid values and unmutes when slider rises above zero`, () => {
    const system = audio();
    const field = channel === 'Sfx' ? 'sfxVolume' : 'bgmVolumeFactor';
    const muted = channel === 'Sfx' ? 'sfxMuted' : 'bgmMuted';
    system[`set${channel}Volume`](-1);
    assert.equal(system[field], 0);
    assert.equal(system[muted], true);
    system[`set${channel}Volume`](0.37);
    assert.equal(system[field], 0.37);
    assert.equal(system[muted], false);
    system[`toggle${channel}Mute`]();
    system[`toggle${channel}Mute`]();
    assert.equal(system[field], 0.37);
    for (const invalid of [NaN, Infinity, undefined]) system[`set${channel}Volume`](invalid);
    assert.equal(system[field], 0.37);
    system[`set${channel}Volume`](2);
    assert.equal(system[field], 1);
  });
}

test('music slider updates both crossfade players at their existing fade positions', () => {
  const system = audio();
  system._isCrossfading = true;
  system._crossfadeProgress = 0.25;
  system.setBgmVolume(0.43);
  const target = 0.38 * 0.43;
  assert.equal(system.playerA.volume, target * Math.cos(0.25 * Math.PI / 2));
  assert.equal(system.playerB.volume, target * Math.sin(0.25 * Math.PI / 2));
});

function uiSetup() {
  const nodes = new Map();
  function node(id) {
    if (!nodes.has(id)) nodes.set(id, { handlers: {}, style: {}, attributes: {}, classList: { toggle() {} },
      offsetWidth: 260, offsetHeight: 140, value: '100',
      addEventListener(type, handler) { this.handlers[type] = handler; },
      setAttribute(key, value) { this.attributes[key] = value; },
      getBoundingClientRect() { return { right: 390, top: 20, bottom: 60 }; }, focus() {}, contains(target) { return this === target; } });
    return nodes.get(id);
  }
  globalThis.document = { hidden: false, getElementById: node, addEventListener() {}, removeEventListener() {} };
  globalThis.window = { innerWidth: 400, innerHeight: 600, addEventListener() {}, removeEventListener() {} };
  const ui = new UIManager({}, null, audio());
  ui._bindAudioControls();
  return ui;
}

test('menu and HUD buttons share continuous slider settings and close on repeated click', () => {
  const ui = uiSetup();
  ui.dom.menuBtnSfx.handlers.click();
  assert.equal(ui.dom.volumePopover.hidden, false);
  ui.dom.volumeSlider.value = '47';
  ui.dom.volumeSlider.handlers.input();
  assert.equal(ui.audioSystem.sfxVolume, 0.47);
  assert.equal(ui.dom.volumeValue.textContent, '47%');
  ui.dom.btnSfx.handlers.click();
  assert.equal(ui.dom.menuBtnSfx.attributes['aria-expanded'], 'false');
  assert.equal(ui.dom.volumeSlider.value, '47');
  ui.dom.btnSfx.handlers.click();
  assert.equal(ui.dom.volumePopover.hidden, true);
  ui.dom.btnMusic.handlers.click();
  ui.dom.volumeSlider.value = '23';
  ui.dom.volumeSlider.handlers.input();
  assert.equal(ui.audioSystem.bgmVolumeFactor, 0.23);
  assert.equal(ui.audioSystem.sfxVolume, 0.47);
});

test('popover mute, escape and outside click work without triggering gameplay keys', () => {
  const ui = uiSetup();
  ui.dom.btnMusic.handlers.click();
  ui.dom.volumeMute.handlers.click();
  assert.equal(ui.dom.volumeSlider.value, '0');
  ui.dom.volumeMute.handlers.click();
  assert.equal(ui.dom.volumeSlider.value, '100');
  let stopped = false;
  ui.dom.volumePopover.handlers.keydown({ key: 'Escape', preventDefault() {}, stopPropagation() { stopped = true; } });
  assert.equal(stopped, true);
  assert.equal(ui.dom.volumePopover.hidden, true);
  ui.dom.btnSfx.handlers.click();
  ui._boundVolumeOutside({ target: {} });
  assert.equal(ui.dom.volumePopover.hidden, true);
});
