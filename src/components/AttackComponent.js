/**
 * AttackComponent.js
 * Pure DTO: offensive capabilities and weapon cooldown.
 */

export class AttackComponent {
  constructor(
    damage = 25,
    attackSpeed = 1.6,
    range = 260,
    cooldown = 0,
    critChance = 0.08,
    critMultiplier = 1.6,
    multishotCount = 1,
    multishotChance = 0.0,
    distanceBonus = 0.001
  ) {
    this.damage = damage;
    this.attackSpeed = attackSpeed;
    this.range = range;
    this.cooldown = cooldown;
    this.aimHoldRemaining = 0; // Baseline attack seconds, advanced together with cooldown.
    this.critChance = critChance;
    this.critMultiplier = critMultiplier;
    this.multishotCount = multishotCount;
    this.multishotChance = multishotChance;
    this.distanceBonus = distanceBonus;
    this.ricochetChance = 0;
    this.ricochetCount = 1;
    this.rapidFireChance = 0;
    this.rapidFireDuration = 0.5;
    this.rapidFireRemaining = 0;
  }
}
