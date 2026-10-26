/**
 * EconomySystem.js
 * Tracks credit income, kill bounties, and wave clear bonuses.
 * Interacts with EconomyComponent and dispatches balance change events.
 */

import { TowerComponent } from '../components/TowerComponent.js';
import { EconomyComponent } from '../components/EconomyComponent.js';
import { GameConfig } from '../config/GameConfig.js';

export class EconomySystem {
  init(world) {
    world.eventBus.on('ENTITY_DIED', event => {
      if (!event.isEnemy || world.inMenu || world.isGameOver) return;
      const eco = this._getEconomy(world);
      if (!eco || eco.crystalsSettled || Math.random() >= Math.max(0, Math.min(1, eco.crystalDropChance))) return;
      this._earnCrystals(world, eco, GameConfig.crystals.killReward, 'kill', event);
    });
    world.eventBus.on('WAVE_COMPLETED', ({ wave }) => {
      const eco = this._getEconomy(world);
      if (!eco || world.inMenu || world.isGameOver || eco.crystalsSettled || !Number.isSafeInteger(wave) || wave <= eco.lastCrystalRewardWave) return;
      eco.lastCrystalRewardWave = wave;
      const base = GameConfig.crystals.waveBaseReward + (wave - 1) * GameConfig.crystals.waveRewardGrowth;
      this._earnCrystals(world, eco, Math.floor(base * eco.crystalWaveMultiplier + 1e-9), 'wave');
    });
    world.eventBus.on('GAME_OVER', () => {
      const eco = this._getEconomy(world);
      if (!world.isGameOver || !eco || eco.crystalsSettled) return;
      eco.crystalsSettled = true;
      world.eventBus.emit('RUN_CRYSTALS_SETTLED', { earned: eco.runCrystals });
    });
    world.eventBus.on('STAGE_COMPLETED', ({ stage }) => {
      const eco = this._getEconomy(world);
      if (!world.isGameOver || world.runOutcome !== 'victory' || world.stageId !== stage || !eco || eco.crystalsSettled) return;
      eco.crystalsSettled = true;
      world.eventBus.emit('RUN_CRYSTALS_SETTLED', { earned: eco.runCrystals, completedStage: stage });
    });
    // 1. Enemy kill bounty
    world.eventBus.on('ENTITY_DIED', (event) => {
      if (!event.isEnemy) return;

      const eco = this._getEconomy(world);
      if (!eco) return;

      const baseReward = event.baseReward !== undefined ? event.baseReward : 10;
      if (baseReward <= 0) return;

      const earned = Math.max(1, Math.round(baseReward * GameConfig.enemyCreditRewardMultiplier * (eco.killMultiplier || 1.0)));
      eco.credits += earned;

      world.eventBus.emit('CREDITS_CHANGED', {
        credits: eco.credits,
        earned,
        source: 'kill',
        x: event.x,
        y: event.y
      });
    });

    // 2. Wave completion reward
    world.eventBus.on('WAVE_COMPLETED', (event) => {
      const eco = this._getEconomy(world);
      if (!eco) return;

      const baseBonus = GameConfig.waves.waveBaseReward ?? 10;
      const growth = GameConfig.waves.waveRewardGrowth ?? 5;
      const wave = event.wave || 1;
      const rawBonus = baseBonus + wave * growth;
      const rewardMultiplier = Math.pow(GameConfig.waves.rewardScaleFactor || 1.04, Math.max(0, wave - 1));
      const earned = Math.round(rawBonus * rewardMultiplier * (eco.waveMultiplier || 1.0));

      eco.credits += earned;

      world.eventBus.emit('CREDITS_CHANGED', {
        credits: eco.credits,
        earned,
        source: 'wave'
      });
    });

    // 3. Purchase deduction
    world.eventBus.on('UPGRADE_PURCHASED', (event) => {
      if (event.isFree || event.cost <= 0) return;
      const eco = this._getEconomy(world);
      if (!eco) return;

      eco.credits -= event.cost;

      world.eventBus.emit('CREDITS_CHANGED', {
        credits: eco.credits,
        earned: -event.cost,
        source: 'purchase'
      });
    });
  }

  update(world, deltaTime) {
    // Economy is event-driven; no per-frame polling needed here
  }

  _earnCrystals(world, eco, amount, source, position = {}) {
    if (!Number.isSafeInteger(amount) || amount <= 0 || !Number.isSafeInteger(eco.runCrystals + amount)) return;
    eco.runCrystals += amount;
    world.eventBus.emit('RUN_CRYSTALS_CHANGED', { earned: amount, total: eco.runCrystals, source, x: position.x, y: position.y });
  }

  _getEconomy(world) {
    const towers = world.getEntitiesWith(TowerComponent, EconomyComponent);
    if (towers.length > 0) {
      return world.getComponent(towers[0], EconomyComponent);
    }
    return null;
  }
}
