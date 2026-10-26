/** Pure DTO: finite launch cycles and firing timers for the stage-two carrier. */
export class CarrierComponent {
  constructor() {
    this.phase = 'approach';
    this.phaseRemaining = 0;
    this.elapsed = 0;
    this.launches = 0;
    this.pendingLaunch = false;
    this.shotCooldown = 0;
    this.orbitDirection = 1;
  }
}
