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
    // 1. Enemy kill bounty
    world.eventBus.on('ENTITY_DIED', (event) => {
      if (!event.isEnemy) return;

      const eco = this._getEconomy(world);
      if (!eco) return;

      const baseReward = event.baseReward !== undefined ? event.baseReward : 10;
      if (baseReward <= 0) return;

      const earned = Math.max(1, Math.round(baseReward * (eco.killMultiplier || 1.0)));
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

      const baseBonus = GameConfig.waves.waveBaseReward || 50;
      const growth = GameConfig.waves.waveRewardGrowth || 25;
      const rawBonus = baseBonus + (event.wave || 1) * growth;
      const earned = Math.round(rawBonus * (eco.waveMultiplier || 1.0));

      eco.credits += earned;

      world.eventBus.emit('CREDITS_CHANGED', {
        credits: eco.credits,
        earned,
        source: 'wave'
      });
    });

    // 3. Purchase deduction
    world.eventBus.on('UPGRADE_PURCHASED', (event) => {
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

  _getEconomy(world) {
    const towers = world.getEntitiesWith(TowerComponent, EconomyComponent);
    if (towers.length > 0) {
      return world.getComponent(towers[0], EconomyComponent);
    }
    return null;
  }
}
