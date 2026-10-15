/**
 * TransformComponent.js
 * Pure DTO: position and orientation in 2D space.
 */

export class TransformComponent {
  constructor(x = 0, y = 0, rotation = 0) {
    this.x = x;
    this.y = y;
    this.rotation = rotation;
  }
}
