/**
 * PhysicsSeparationSystem.js
 * Prevents swarm clustering by applying soft-elastic mass-weighted repulsion
 * between overlapping circle colliders.
 */

import { TransformComponent } from '../components/TransformComponent.js';
import { CircleColliderComponent } from '../components/CircleColliderComponent.js';
import { TowerComponent } from '../components/TowerComponent.js';
import { GameConfig } from '../config/GameConfig.js';

export class PhysicsSeparationSystem {
  update(world, deltaTime) {
    const pushStrength = GameConfig.physics.separationPushStrength || 0.65;
    const dynamicColliders = world.getEntitiesWith(TransformComponent, CircleColliderComponent)
      .filter(id => {
        const col = world.getComponent(id, CircleColliderComponent);
        return !col.isStatic;
      });

    const count = dynamicColliders.length;

    // 1. Pairwise collision resolution between dynamic bodies
    if (count >= 2) {
      for (let i = 0; i < count; i++) {
        const idA = dynamicColliders[i];
        const transA = world.getComponent(idA, TransformComponent);
        const colA = world.getComponent(idA, CircleColliderComponent);

        for (let j = i + 1; j < count; j++) {
          const idB = dynamicColliders[j];
          const transB = world.getComponent(idB, TransformComponent);
          const colB = world.getComponent(idB, CircleColliderComponent);

          const dx = transB.x - transA.x;
          const dy = transB.y - transA.y;
          const dist = Math.hypot(dx, dy);
          const minDist = colA.radius + colB.radius;

          if (dist < minDist) {
            // If perfectly overlapping, create a slight random divergence
            const safeDist = dist > 0.0001 ? dist : 0.0001;
            const nx = dist > 0.0001 ? dx / safeDist : (Math.random() - 0.5);
            const ny = dist > 0.0001 ? dy / safeDist : (Math.random() - 0.5);

            const overlap = minDist - safeDist;
            const totalMass = (colA.mass || 1) + (colB.mass || 1);

            // Inverse mass weighting: heavier body moves less, lighter body moves more
            const weightA = (colB.mass || 1) / totalMass;
            const weightB = (colA.mass || 1) / totalMass;

            const shift = overlap * pushStrength;

            transA.x -= nx * shift * weightA;
            transA.y -= ny * shift * weightA;

            transB.x += nx * shift * weightB;
            transB.y += ny * shift * weightB;
          }
        }
      }
    }

    // 2. Resolve dynamic colliders against central static tower core collider
    const towers = world.getEntitiesWith(TowerComponent, TransformComponent, CircleColliderComponent);
    if (towers.length > 0) {
      const towerTrans = world.getComponent(towers[0], TransformComponent);
      const towerCol = world.getComponent(towers[0], CircleColliderComponent);

      for (let i = 0; i < count; i++) {
        const id = dynamicColliders[i];
        const trans = world.getComponent(id, TransformComponent);
        const col = world.getComponent(id, CircleColliderComponent);

        const dx = trans.x - towerTrans.x;
        const dy = trans.y - towerTrans.y;
        const dist = Math.hypot(dx, dy);
        const minDist = towerCol.radius + col.radius;

        if (dist < minDist) {
          const safeDist = dist > 0.0001 ? dist : 0.0001;
          const nx = dx / safeDist;
          const ny = dy / safeDist;
          trans.x = towerTrans.x + nx * minDist;
          trans.y = towerTrans.y + ny * minDist;
        }
      }
    }
  }
}
