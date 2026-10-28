export class FractalComponent {
  constructor() {
    this.branches = [];
    this.phase = 'approach';
    this.phaseRemaining = 0;
    this.elapsed = 0;
    this.shots = 0;
  }
}

// Pure state, including an identity token for the original parent, never ID alone.
export class FractalBranchComponent {
  constructor(ownerId, ownerHealth, slot, depth = 0, attached = true) {
    this.ownerId = ownerId;
    this.ownerHealth = ownerHealth;
    this.slot = slot;
    this.depth = depth;
    this.attached = attached;
    this.pendingSplit = depth < 2;
  }
}
