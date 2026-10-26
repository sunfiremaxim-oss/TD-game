/** Temporary playtest switches; data only, never persisted. */
export class DevControlComponent {
  constructor() {
    this.enabled = false;
    this.invulnerable = false;
    this.firingDisabled = false;
    this.wavesFrozen = false;
  }
}
