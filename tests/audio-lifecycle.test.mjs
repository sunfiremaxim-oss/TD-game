import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioSystem } from '../src/systems/AudioSystem.js';

function setup() {
  const nodes = [], sources = [], buffers = [];
  const param = () => ({ setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} });
  const node = source => {
    const n = { connected: false, gain: param(), frequency: param(),
      connect() { this.connected = true; }, disconnect() { this.connected = false; },
      start(...args) { this.started = args; }, stop(time) { this.stoppedAt = time; } };
    nodes.push(n); if (source) sources.push(n); return n;
  };
  const ctx = { currentTime: 10, sampleRate: 48000,
    createOscillator: () => node(true), createGain: () => node(false), createBiquadFilter: () => node(false),
    createBufferSource() { const n = node(true); n.buffer = null; return n; },
    createBuffer(channels, count) { const buffer = { getChannelData: () => new Float32Array(count) }; buffers.push(buffer); return buffer; } };
  const audio = Object.create(AudioSystem.prototype);
  Object.assign(audio, { _canPlaySfx: () => true, _ensureAudioContext: () => ctx, _getSfxDestination: () => ({}) });
  return { audio, ctx, nodes, sources, buffers };
}
test('all synthesized voices disconnect their whole chain on completion', () => {
  const { audio, nodes, sources } = setup();
  for (const method of ['playLaserSound', 'playHitSound', 'playCritSound', 'playExplosionSound',
    'playUpgradeSound', 'playWaveAlertSound', 'playWaveClearSound', 'playGameOverSound', 'playBlinkerDashSound']) audio[method]();
  assert.ok(nodes.every(n => n.connected));
  for (const source of sources) {
    assert.ok(Number.isFinite(source.stoppedAt)); assert.equal(typeof source.onended, 'function');
    source.onended(); assert.equal(source.onended, null);
    if ('buffer' in source) assert.equal(source.buffer, null);
  }
  assert.ok(nodes.every(n => !n.connected));
});
test('hundreds of explosion sounds reuse one noise buffer and release every source and filter', () => {
  const { audio, buffers, sources, nodes } = setup();
  for (let i = 0; i < 500; i++) { audio.playExplosionSound(i % 2 ? 'scout' : 'tank'); sources.at(-1).onended(); }
  assert.equal(buffers.length, 1);
  assert.ok(nodes.every(n => !n.connected));
  assert.ok(sources.every(n => n.buffer === null && n.started[1] >= 0 && n.started[1] < .6));
});
