/**
 * RenderComponent.js
 * Pure DTO: geometric rendering attributes and neon bloom effects.
 */

export class RenderComponent {
  constructor(
    shape = 'polygon',
    sides = 4,
    radius = 15,
    color = '#00f3ff',
    glowColor = '#00f3ff',
    glowBlur = 10
  ) {
    this.shape = shape; // 'circle' | 'polygon' | 'projectile' | 'tower'
    this.sides = sides;
    this.radius = radius;
    this.color = color;
    this.glowColor = glowColor;
    this.glowBlur = glowBlur;
  }
}
