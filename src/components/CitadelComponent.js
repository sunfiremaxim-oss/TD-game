// Six fixed slots retain health identities: recycled entity IDs are never attachments.
export class CitadelComponent {
  constructor() {
    this.generators = [];
    this.hullExposed = false;
    this.elapsed = 0;
    this.shotCooldown = 1.4;
    this.shots = 0;
  }
}

export class CitadelGeneratorComponent {
  constructor(ownerId, ownerHealth, slot) {
    this.ownerId = ownerId;
    this.ownerHealth = ownerHealth;
    this.slot = slot;
  }
}
