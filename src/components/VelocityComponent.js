/**
 * VelocityComponent.js
 * Pure DTO: velocity vectors and speed metrics.
 */

export class VelocityComponent {
  constructor(vx = 0, vy = 0, baseSpeed = 100, currentSpeed = 100) {
    this.vx = vx;
    this.vy = vy;
    this.baseSpeed = baseSpeed;
    this.currentSpeed = currentSpeed;
  }
}
