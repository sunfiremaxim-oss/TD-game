/**
 * EconomyComponent.js
 * Pure DTO: player credit balance and economic multipliers.
 */

import { GameConfig } from '../config/GameConfig.js';

export class EconomyComponent {
  constructor(credits = GameConfig.tower.startCredits, killMultiplier = 1.0, waveMultiplier = 1.0) {
    this.credits = credits;
    this.killMultiplier = killMultiplier;
    this.waveMultiplier = waveMultiplier;
    this.crystalDropChance = GameConfig.crystals.baseDropChance;
    this.crystalWaveMultiplier = 1;
    this.runCrystals = 0;
    this.lastCrystalRewardWave = 0;
    this.crystalsSettled = false;
  }
}
