/**
 * UpgradeManager.js
 * Handles upgrade calculations, exponential cost scaling, and mutation
 * of component parameters upon purchase.
 */

import { GameConfig } from '../config/GameConfig.js';
import { TowerComponent } from '../components/TowerComponent.js';
import { AttackComponent } from '../components/AttackComponent.js';
import { HealthComponent } from '../components/HealthComponent.js';
import { ArmorComponent } from '../components/ArmorComponent.js';
import { EconomyComponent } from '../components/EconomyComponent.js';

export class UpgradeManager {
  constructor() {
    this.levels = new Map();
    // Initialize all 12 upgrades to level 0
    for (const key of Object.keys(GameConfig.upgrades)) {
      this.levels.set(key, 0);
    }
  }

  getLevel(upgradeId) {
    return this.levels.get(upgradeId) || 0;
  }

  getCost(upgradeId) {
    const def = GameConfig.upgrades[upgradeId];
    if (!def) return Infinity;
    const lvl = this.getLevel(upgradeId);
    if (def.maxLevel && lvl >= def.maxLevel) return Infinity;
    return Math.round(def.baseCost * Math.pow(def.costMultiplier, lvl));
  }

  canAfford(upgradeId, credits) {
    const cost = this.getCost(upgradeId);
    return credits >= cost && isFinite(cost);
  }

  getCurrentValue(upgradeId) {
    const lvl = this.getLevel(upgradeId);
    const def = GameConfig.upgrades[upgradeId];
    if (!def) return 0;

    switch (upgradeId) {
      case 'damage':
        return GameConfig.tower.baseDamage + lvl * def.valuePerLevel;
      case 'attackSpeed':
        return GameConfig.tower.baseAttackSpeed + lvl * def.valuePerLevel;
      case 'critChance':
        return GameConfig.tower.baseCritChance + lvl * def.valuePerLevel;
      case 'critDamage':
        return GameConfig.tower.baseCritMultiplier + lvl * def.valuePerLevel;
      case 'multishotChance':
        return GameConfig.tower.baseMultishotChance + lvl * def.valuePerLevel;
      case 'multishotTargets':
        return GameConfig.tower.baseMultishotCount + lvl * def.valuePerLevel;
      case 'range': {
        const effectiveLvl = def.maxLevel ? Math.min(lvl, def.maxLevel) : lvl;
        return GameConfig.tower.baseRange + effectiveLvl * def.valuePerLevel;
      }
      case 'distanceDamage':
        return (GameConfig.tower.baseDistanceDamageCoeff || 0.001) + lvl * def.valuePerLevel;
      case 'maxHealth':
        return GameConfig.tower.baseHealth + lvl * def.valuePerLevel;
      case 'armorPercent':
        return Math.min(0.85, GameConfig.tower.basePercentArmor + lvl * def.valuePerLevel);
      case 'flatArmor':
        return GameConfig.tower.baseFlatArmor + lvl * def.valuePerLevel;
      case 'healthRegen':
        return GameConfig.tower.baseRegen + lvl * def.valuePerLevel;
      case 'killCashBonus':
        return 1.0 + lvl * def.valuePerLevel;
      case 'waveCashBonus':
        return 1.0 + lvl * def.valuePerLevel;
      default:
        return 0;
    }
  }

  getNextValue(upgradeId) {
    const lvl = this.getLevel(upgradeId) + 1;
    const def = GameConfig.upgrades[upgradeId];
    if (!def) return 0;

    switch (upgradeId) {
      case 'damage':
        return GameConfig.tower.baseDamage + lvl * def.valuePerLevel;
      case 'attackSpeed':
        return GameConfig.tower.baseAttackSpeed + lvl * def.valuePerLevel;
      case 'critChance':
        return GameConfig.tower.baseCritChance + lvl * def.valuePerLevel;
      case 'critDamage':
        return GameConfig.tower.baseCritMultiplier + lvl * def.valuePerLevel;
      case 'multishotChance':
        return GameConfig.tower.baseMultishotChance + lvl * def.valuePerLevel;
      case 'multishotTargets':
        return GameConfig.tower.baseMultishotCount + lvl * def.valuePerLevel;
      case 'range': {
        const effectiveLvl = def.maxLevel ? Math.min(lvl, def.maxLevel) : lvl;
        return GameConfig.tower.baseRange + effectiveLvl * def.valuePerLevel;
      }
      case 'distanceDamage':
        return (GameConfig.tower.baseDistanceDamageCoeff || 0.001) + lvl * def.valuePerLevel;
      case 'maxHealth':
        return GameConfig.tower.baseHealth + lvl * def.valuePerLevel;
      case 'armorPercent':
        return Math.min(0.85, GameConfig.tower.basePercentArmor + lvl * def.valuePerLevel);
      case 'flatArmor':
        return GameConfig.tower.baseFlatArmor + lvl * def.valuePerLevel;
      case 'healthRegen':
        return GameConfig.tower.baseRegen + lvl * def.valuePerLevel;
      case 'killCashBonus':
        return 1.0 + lvl * def.valuePerLevel;
      case 'waveCashBonus':
        return 1.0 + lvl * def.valuePerLevel;
      default:
        return 0;
    }
  }

  buyUpgrade(upgradeId, world) {
    const cost = this.getCost(upgradeId);
    if (!isFinite(cost)) return false;

    // Check credits on tower economy
    const towers = world.getEntitiesWith(TowerComponent, EconomyComponent);
    if (towers.length === 0) return false;

    const towerId = towers[0];
    const economy = world.getComponent(towerId, EconomyComponent);

    if (economy.credits < cost) return false;

    // Increment level
    const currentLvl = this.getLevel(upgradeId);
    this.levels.set(upgradeId, currentLvl + 1);

    // Apply stats to component
    this._applyToTower(upgradeId, world, towerId);

    // Notify event bus
    world.eventBus.emit('UPGRADE_PURCHASED', {
      upgradeId,
      cost,
      newLevel: currentLvl + 1
    });

    return true;
  }

  _applyToTower(upgradeId, world, towerId) {
    const attack = world.getComponent(towerId, AttackComponent);
    const health = world.getComponent(towerId, HealthComponent);
    const armor = world.getComponent(towerId, ArmorComponent);
    const economy = world.getComponent(towerId, EconomyComponent);

    const newVal = this.getCurrentValue(upgradeId);

    switch (upgradeId) {
      case 'damage':
        if (attack) attack.damage = newVal;
        break;
      case 'attackSpeed':
        if (attack) attack.attackSpeed = newVal;
        break;
      case 'critChance':
        if (attack) attack.critChance = newVal;
        break;
      case 'critDamage':
        if (attack) attack.critMultiplier = newVal;
        break;
      case 'multishotChance':
        if (attack) attack.multishotChance = newVal;
        break;
      case 'multishotTargets':
        if (attack) attack.multishotCount = newVal;
        break;
      case 'range':
        if (attack) {
          const maxScreenRange = (world && world.height) ? Math.floor((world.height / 2) - 20) : 290;
          attack.range = Math.min(newVal, Math.max(GameConfig.tower.baseRange, maxScreenRange));
        }
        break;
      case 'distanceDamage':
        if (attack) attack.distanceBonus = newVal;
        break;
      case 'maxHealth':
        if (health) {
          const diff = newVal - health.max;
          health.max = newVal;
          health.current = Math.min(health.max, health.current + diff);
        }
        break;
      case 'armorPercent':
        if (armor) armor.percentReduction = newVal;
        break;
      case 'flatArmor':
        if (armor) armor.flatReduction = newVal;
        break;
      case 'healthRegen':
        if (health) health.regenRate = newVal;
        break;
      case 'killCashBonus':
        if (economy) economy.killMultiplier = newVal;
        break;
      case 'waveCashBonus':
        if (economy) economy.waveMultiplier = newVal;
        break;
    }
  }

  getAllUpgrades() {
    return Object.values(GameConfig.upgrades).map(def => ({
      ...def,
      level: this.getLevel(def.id),
      cost: this.getCost(def.id),
      currentVal: this.getCurrentValue(def.id),
      nextVal: this.getNextValue(def.id)
    }));
  }
}
