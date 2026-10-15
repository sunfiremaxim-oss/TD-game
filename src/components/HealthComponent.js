/**
 * HealthComponent.js
 * Pure DTO: hit points and passive regeneration rate.
 */

export class HealthComponent {
  constructor(current = 100, max = 100, regenRate = 0) {
    this.current = current;
    this.max = max;
    this.regenRate = regenRate;
  }
}
