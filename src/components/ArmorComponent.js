/**
 * ArmorComponent.js
 * Pure DTO: defensive mitigation stats (percent and flat reduction).
 */

export class ArmorComponent {
  constructor(percentReduction = 0, flatReduction = 0) {
    this.percentReduction = percentReduction;
    this.flatReduction = flatReduction;
  }
}
