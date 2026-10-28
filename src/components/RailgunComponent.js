/** Pure DTO: stage-four sniper boss cycle, measured in simulation seconds. */
export class RailgunComponent {
  constructor() {
    this.phase = 'approach';
    this.phaseRemaining = 0;
    this.elapsed = 0;
    this.shots = 0;
    this.orbitDirection = 1;
    this.shieldHp = 0;
    this.shieldMax = 0;
    this.shieldHitRemaining = 0;
  }
}
