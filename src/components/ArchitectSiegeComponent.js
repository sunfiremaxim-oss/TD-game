/** Pure DTO: the armored siege / drilling / overheating cycle. */
export class ArchitectSiegeComponent {
  constructor() {
    this.phase = 'approach';
    this.phaseRemaining = 0;
    this.cycles = 0;
  }
}
