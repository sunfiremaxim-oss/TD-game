/**
 * TargetComponent.js
 * Pure DTO: target tracking and prioritization heuristic.
 */

export class TargetComponent {
  constructor(targetEntityId = null, strategy = 'closest') {
    this.targetEntityId = targetEntityId;
    this.strategy = strategy; // 'closest' | 'strongest' | 'weakest'
  }
}
