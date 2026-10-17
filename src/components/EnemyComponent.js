/**
 * EnemyComponent.js
 * Pure DTO: enemy metadata, type archetype, reward value, and sniper state.
 */

export class EnemyComponent {
  constructor(
    type = 'scout',
    baseReward = 10,
    isSniper = false,
    shootCooldown = 0,
    shootInterval = 2.8,
    stopDistance = 240,
    rotationSpeed = 0,
    damage = 15,
    meleeInterval = 1.0,
    shieldDomeRadius = 0
  ) {
    this.type = type; // 'scout' | 'fighter' | 'tank' | 'sniper' | 'aegis' | 'splitter' | 'splitter_shard' | 'blinker' | 'boss_architect' | 'boss_shield'
    this.baseReward = baseReward;
    this.isSniper = isSniper;
    this.shootCooldown = shootCooldown;
    this.shootInterval = shootInterval;
    this.stopDistance = stopDistance;
    this.rotationSpeed = rotationSpeed;
    this.damage = damage;
    this.meleeCooldown = 0; // ready on first contact
    this.meleeInterval = meleeInterval; // strikes every 1.0s while contacting tower

    // Aegis defensive aura dome
    this.shieldDomeRadius = shieldDomeRadius;
    this.isStopped = false; // Stopped at perimeter (used by snipers and Aegis holding bunker)
    this.aegisTargetId = null;

    // Blinker teleport dash
    this.blinkCooldown = 2.0;

    // Boss Architect orbital shield ring
    this.shieldIds = null;
    this.shieldOrbitRadius = 0;
    this.shieldOrbitSpeed = 0;
    this.shieldOrbitAngle = 0;

    // Splitter shard scatter burst duration (backward & sideways impulse before homing)
    this.scatterTimer = 0;
  }
}
