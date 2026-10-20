/**
 * ProjectileComponent.js
 * Pure DTO: projectile trajectory state, lifetime counter, and damage payload.
 */

export class ProjectileComponent {
  constructor(
    sourceEntityId = null,
    targetEntityId = null,
    lifetime = 0,
    maxLifetime = 2.5,
    damage = 25,
    isCrit = false,
    isEnemy = false,
    originX = 0,
    originY = 0,
    distanceBonus = 0
  ) {
    this.sourceEntityId = sourceEntityId;
    this.targetEntityId = targetEntityId;
    this.lifetime = lifetime;
    this.maxLifetime = maxLifetime;
    this.damage = damage;
    this.isCrit = isCrit;
    this.isEnemy = isEnemy;
    this.originX = originX;
    this.originY = originY;
    this.distanceBonus = distanceBonus;
    this.sourceHealth = null; // Identity guard when an enemy shooter's ID is recycled.
    this.ricochetChance = 0;
    this.ricochetsRemaining = 0;
    this.ricochetActive = null; // One chance roll per chain, not per bounce.
    this.hitTargets = null; // Lazily allocated Set of HealthComponent identities.
  }
}
