/**
 * CircleColliderComponent.js
 * Pure DTO: circle collision boundary, mass, and static flag.
 */

export class CircleColliderComponent {
  constructor(radius = 15, mass = 1.0, isStatic = false) {
    this.radius = radius;
    this.mass = mass;
    this.isStatic = isStatic;
  }
}
