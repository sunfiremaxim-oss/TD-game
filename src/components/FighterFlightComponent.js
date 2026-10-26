/** Per-fighter flight state only; steering decisions belong to FighterSteering. */
export class FighterFlightComponent {
  constructor(direction = 1, spiralRatio = 3.0) {
    this.direction = direction;
    this.spiralRatio = spiralRatio;
    this.heading = null;
    this.obstacle = null;
    this.passSide = 1;
    this.mode = 'spiral'; // spiral | joining | escort | breakout | charge
    this.escortTankId = null;
    this.escortTank = null; // Component identity protects against recycled entity IDs.
    this.escortSlot = 0;
    this.chargeElapsed = 0;
    this.exitSide = direction;
  }
}
