/**
 * TargetComponent.js
 * Pure DTO: the enemy currently tracked by the tower, including pre-aim outside range.
 */

export class TargetComponent {
  constructor(targetEntityId = null) {
    this.targetEntityId = targetEntityId;
    this.contactTargetId = null;
    this.contactTargetHealth = null;
  }
}
