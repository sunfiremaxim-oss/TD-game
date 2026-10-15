/**
 * EconomyComponent.js
 * Pure DTO: player credit balance and economic multipliers.
 */

export class EconomyComponent {
  constructor(credits = 100, killMultiplier = 1.0, waveMultiplier = 1.0) {
    this.credits = credits;
    this.killMultiplier = killMultiplier;
    this.waveMultiplier = waveMultiplier;
  }
}
