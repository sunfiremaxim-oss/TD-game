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
import { DefenseComponent } from '../components/DefenseComponent.js';

export class UpgradeManager {
  constructor() {
    this.levels = new Map();
    this._lastFreeWave = 0;
    for (const key of Object.keys(GameConfig.upgrades)) {
      this.levels.set(key, 0);
    }
  }

  reset() {
    this._lastFreeWave = 0;
    this.levels.clear();
    for (const key of Object.keys(GameConfig.upgrades)) {
      this.levels.set(key, 0);
    }
  }

  init(world) {
    world.eventBus.on('WAVE_COMPLETED', ({ wave }) => this.rollFreeUpgrades(world, wave));
  }

  getLockReason(upgradeId) {
    const req = GameConfig.upgrades[upgradeId]?.requires;
    return req && !this.isUnlocked(upgradeId)
      ? `Сначала: ${GameConfig.upgrades[req.id].name}, ур. ${req.minLevel || 1}` : '';
  }


  getLevel(upgradeId) {
    return this.levels.get(upgradeId) || 0;
  }

  isUnlocked(upgradeId) {
    const def = GameConfig.upgrades[upgradeId];
    if (def && def.requires) {
      const reqLvl = this.getLevel(def.requires.id);
      if (reqLvl < (def.requires.minLevel || 1)) {
        return false;
      }
    }
    return true;
  }

  getCost(upgradeId) {
    const def = GameConfig.upgrades[upgradeId];
    if (!def) return Infinity;
    const lvl = this.getLevel(upgradeId);
    if (def.maxLevel && lvl >= def.maxLevel) return Infinity;
    return Math.round(def.baseCost * Math.pow(def.costMultiplier, lvl));
  }

  canAfford(upgradeId, credits) {
    if (!this.isUnlocked(upgradeId)) return false;
    const cost = this.getCost(upgradeId);
    return credits >= cost && isFinite(cost);
  }

  getCurrentValue(upgradeId) {
    return this._valueAtLevel(upgradeId, this.getLevel(upgradeId));
  }

  _valueAtLevel(upgradeId, level) {
    const def = GameConfig.upgrades[upgradeId];
    if (!def) return 0;
    const lvl = def.maxLevel ? Math.min(level, def.maxLevel) : level;

    switch (upgradeId) {
      case 'rapidFireChance':
        // Sum diminishing increments without iterating through every purchased level.
        return def.baseValue + def.valuePerLevel * -Math.expm1(lvl * Math.log(def.valueDecay)) / (1 - def.valueDecay);
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
        return (def.baseValue || 0) + lvl * def.valuePerLevel;
    }
  }

  getNextValue(upgradeId) {
    return this._valueAtLevel(upgradeId, this.getLevel(upgradeId) + 1);
  }

  buyUpgrade(upgradeId, world) {
    if (!this.isUnlocked(upgradeId)) return false;
    const cost = this.getCost(upgradeId);
    if (!isFinite(cost)) return false;

    // Check credits on tower economy
    const towers = world.getEntitiesWith(TowerComponent, EconomyComponent);
    if (towers.length === 0) return false;

    const towerId = towers[0];
    const economy = world.getComponent(towerId, EconomyComponent);

    if (economy.credits < cost) return false;

    this._grantLevel(upgradeId, world, towerId, cost, false);
    return true;
  }

  _grantLevel(upgradeId, world, towerId, cost, isFree) {
    const currentLvl = this.getLevel(upgradeId);
    this.levels.set(upgradeId, currentLvl + 1);

    // Apply stats to component
    this._applyToTower(upgradeId, world, towerId);

    // Notify event bus
    world.eventBus.emit('UPGRADE_PURCHASED', {
      upgradeId,
      cost,
      newLevel: currentLvl + 1,
      isFree
    });

  }

  rollFreeUpgrades(world, wave) {
    if (!Number.isInteger(wave) || wave <= this._lastFreeWave || world.isGameOver || world.inMenu) return [];
    this._lastFreeWave = wave;
    const towerId = world.getEntitiesWith(TowerComponent, EconomyComponent)[0];
    if (towerId === undefined) return [];
    // Freeze all three odds before granting anything: an economy grant cannot reroll itself.
    const rolls = [['offense', 'freeAttackChance'], ['defense', 'freeDefenseChance'], ['utility', 'freeEconomyChance']]
      .map(([category, id]) => ({ category, chance: this.getCurrentValue(id) }));
    const granted = [];
    for (const { category, chance } of rolls) {
      if (chance <= 0 || Math.random() >= chance) continue;
      const candidates = Object.values(GameConfig.upgrades).filter(def => def.category === category &&
        this.isUnlocked(def.id) && (!def.maxLevel || this.getLevel(def.id) < def.maxLevel));
      if (candidates.length === 0) continue;
      const def = candidates[Math.floor(Math.random() * candidates.length)];
      this._grantLevel(def.id, world, towerId, 0, true);
      granted.push({ upgradeId: def.id, category, name: def.name, level: this.getLevel(def.id) });
    }
    if (granted.length) world.eventBus.emit('FREE_UPGRADES_GRANTED', { wave, granted, towerId });
    return granted;
  }

  applyAll(world, towerId) {
    for (const id of this.levels.keys()) this._applyToTower(id, world, towerId);
  }

  _applyToTower(upgradeId, world, towerId) {
    const attack = world.getComponent(towerId, AttackComponent);
    const health = world.getComponent(towerId, HealthComponent);
    const armor = world.getComponent(towerId, ArmorComponent);
    const economy = world.getComponent(towerId, EconomyComponent);
    const defense = world.getComponent(towerId, DefenseComponent);

    const newVal = this.getCurrentValue(upgradeId);

    switch (upgradeId) {
      case 'ricochetChance':
      case 'ricochetCount':
      case 'rapidFireChance':
      case 'rapidFireDuration':
        if (attack) attack[upgradeId] = newVal;
        break;
      case 'damageReflection':
      case 'lifeSteal':
      case 'knockbackChance':
      case 'knockbackPower':
        if (defense) defense[upgradeId] = newVal;
        break;
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
        if (attack) attack.range = newVal;
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
      nextVal: this.getNextValue(def.id),
      isUnlocked: this.isUnlocked(def.id)
    }));
  }
}
