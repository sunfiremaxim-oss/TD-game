import { GameConfig } from '../config/GameConfig.js';
import { UpgradeManager } from './UpgradeManager.js';
import { STAGES, getStage } from '../config/StageConfig.js';
import { UPGRADE_TIERS, normalizeUpgradeTiers, hasUpgradeAccess } from '../config/UpgradeTiers.js';

// The wallet and permanent levels are one save, separate from the current run.
export class PlayerProgress {
  constructor(storage) {
    this.key = 'cyber-core.progress.v1';
    this.crystals = 0;
    this.upgrades = {};
    this.unlockedTiers = normalizeUpgradeTiers();
    this.completedStages = 0;
    this.saved = false;
    this.dirty = false;
    try { this.storage = storage === undefined ? globalThis.localStorage : storage; }
    catch { this.storage = null; }
    this._refresh();
  }

  _read() {
    if (!this.storage) return null;
    try {
      const raw = this.storage.getItem(this.key);
      if (raw === null) return { crystals: 0, upgrades: {} };
      const data = JSON.parse(raw);
      if (data?.version !== 1 || !Number.isSafeInteger(data.crystals) || data.crystals < 0) return null;
      const upgrades = {};
      for (const id of Object.keys(GameConfig.upgrades)) {
        const level = data.upgrades?.[id];
        if (Number.isSafeInteger(level) && level > 0) upgrades[id] = level;
      }
      // Older wallet-only saves retain their balance and start with zero permanent levels.
      const completedStages = Number.isInteger(data.completedStages) && data.completedStages >= 0
        ? Math.min(STAGES.length, data.completedStages) : 0;
      const unlockedTiers = normalizeUpgradeTiers(data.unlockedTiers, data.unlockedTiers === undefined ? upgrades : null);
      for (const id of Object.keys(upgrades)) if (!hasUpgradeAccess(id, unlockedTiers)) delete upgrades[id];
      return { crystals: data.crystals, upgrades, completedStages, unlockedTiers };
    } catch { return null; }
  }

  _refresh() {
    if (this.dirty) return;
    const data = this._read();
    if (data) { this.crystals = data.crystals; this.upgrades = data.upgrades; this.completedStages = data.completedStages || 0; this.unlockedTiers = normalizeUpgradeTiers(data.unlockedTiers); this.saved = true; }
  }

  _save() {
    this.dirty = true;
    try {
      if (!this.storage) throw new Error('Storage unavailable');
      this.storage.setItem(this.key, JSON.stringify({ version: 1, crystals: this.crystals, upgrades: this.upgrades, completedStages: this.completedStages, unlockedTiers: this.unlockedTiers }));
      this.saved = true;
      this.dirty = false;
    } catch { this.saved = false; }
  }

  _publish() {
    this.world?.eventBus.emit('CRYSTAL_BALANCE_CHANGED', { balance: this.crystals, saved: this.saved });
    this.world?.eventBus.emit('STAGE_PROGRESS_CHANGED', { completed: this.completedStages });
  }

  init(world) {
    this._unsubscribe?.();
    this.world = world;
    this._unsubscribe = world.eventBus.on('RUN_CRYSTALS_SETTLED', ({ earned, completedStage }) => {
      this.credit(earned, completedStage);
      this._publish();
    });
    this._publish();
  }

  credit(amount, completedStage = null) {
    if (!Number.isSafeInteger(amount) || amount < 0 || (amount === 0 && !getStage(completedStage))) return false;
    this._refresh();
    if (!Number.isSafeInteger(this.crystals + amount)) return false;
    this.crystals += amount;
    if (getStage(completedStage) && completedStage === this.completedStages + 1) this.completedStages = completedStage;
    this._save();
    return true;
  }

  isStageUnlocked(id) { return Boolean(getStage(id) && id <= this.completedStages + 1); }

  getUpgradeManager({ permanent = true } = {}) { return new UpgradeManager(this.upgrades, this.unlockedTiers, { permanent }); }

  buyTier(category, tierNumber) {
    if (!this.world?.inMenu || !Object.hasOwn(UPGRADE_TIERS, category)) return false;
    this._refresh();
    const tier = UPGRADE_TIERS[category][tierNumber - 1];
    if (!Number.isInteger(tierNumber) || tierNumber !== this.unlockedTiers[category] + 1 || !tier || this.crystals < tier.cost) return false;
    this.crystals -= tier.cost;
    this.unlockedTiers[category] = tierNumber;
    this._save(); this._publish();
    this.world.eventBus.emit('UPGRADE_TIER_UNLOCKED', { category, tier: tierNumber, cost: tier.cost });
    return true;
  }

  reset() {
    this.crystals = 0; this.upgrades = {}; this.completedStages = 0;
    this.unlockedTiers = normalizeUpgradeTiers();
    this._save(); this._publish();
    this.world?.eventBus.emit('PROGRESS_RESET', {});
  }

  buyUpgrade(id) {
    if (!this.world?.inMenu || !Object.hasOwn(GameConfig.upgrades, id)) return false;
    this._refresh();
    const manager = this.getUpgradeManager(), cost = manager.getCost(id);
    if (!manager.isUnlocked(id) || !Number.isSafeInteger(cost) || cost <= 0 || this.crystals < cost) {
      this._publish();
      return false;
    }
    this.crystals -= cost;
    this.upgrades[id] = manager.getLevel(id) + 1;
    this._save();
    this._publish();
    this.world.eventBus.emit('PERMANENT_UPGRADE_PURCHASED', { upgradeId: id, newLevel: this.upgrades[id], cost });
    return true;
  }
}
