import test from 'node:test';
import assert from 'node:assert/strict';
import { UPGRADE_LAYOUT, UIManager } from '../src/ui/UIManager.js';
import { GameConfig } from '../src/config/GameConfig.js';

test('paired upgrade layout includes every configured upgrade once, in its own category', () => {
  const ids = [];
  for (const [category, rows] of Object.entries(UPGRADE_LAYOUT)) {
    for (const row of rows) {
      assert.ok(row.length >= 1 && row.length <= 2);
      for (const id of row) {
        assert.equal(GameConfig.upgrades[id]?.category, category);
        ids.push(id);
      }
    }
  }
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(ids.sort(), Object.keys(GameConfig.upgrades).sort());
});

test('wave progress remains bounded when additional enemies appear during a wave', () => {
  const ui = Object.create(UIManager.prototype);
  ui.dom = { waveBarFill: { style: {} }, enemyText: {} };
  ui.totalEnemies = 10;
  for (const [remaining, percent] of [[10, '0.0%'], [5, '50.0%'], [0, '100.0%'], [13, '0.0%']]) {
    ui.enemiesAlive = remaining;
    ui._updateEnemiesCount();
    assert.equal(ui.dom.waveBarFill.style.width, percent);
  }
  ui.totalEnemies = 0;
  ui._updateEnemiesCount();
  assert.equal(ui.dom.waveBarFill.style.width, '0.0%');
});
