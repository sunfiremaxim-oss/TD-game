/** Pure DTO: close-range drill state, advanced only by combat simulation. */
export class ArchitectDrillComponent {
  constructor() {
    this.active = false;
    this.aimReady = false;
    this.elapsed = 0;
    this.tickRemainder = 0;
  }
}
