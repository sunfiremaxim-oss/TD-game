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
  }
}
