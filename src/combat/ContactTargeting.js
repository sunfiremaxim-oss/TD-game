import { TowerComponent } from '../components/TowerComponent.js';
import { TransformComponent } from '../components/TransformComponent.js';
import { CircleColliderComponent } from '../components/CircleColliderComponent.js';
import { HealthComponent } from '../components/HealthComponent.js';
import { EnemyComponent } from '../components/EnemyComponent.js';
import { ArchitectDrillComponent } from '../components/ArchitectDrillComponent.js';
import { FractalBranchComponent } from '../components/FractalComponent.js';
import { isCombatTargetAvailable } from './CitadelMechanics.js';
const CONTACT_EXCLUDED_TYPES=new Set(['boss_shield','boss_carrier','boss_railgun','boss_citadel','citadel_generator','boss_fractal']);

export function canEnemyMelee(world,id) {
  const enemy=world.getComponent(id,EnemyComponent);
  return !!enemy && !enemy.isSniper && !CONTACT_EXCLUDED_TYPES.has(enemy.type) &&
    !world.hasComponent(id,ArchitectDrillComponent) && !world.getComponent(id,FractalBranchComponent)?.attached;
}

// Shared by aiming and firing. A small separation/knockback does not break focus.
export function getContactTarget(world,towerId,target,range,candidates=null) {
  const origin=world.getComponent(towerId,TransformComponent),towerCol=world.getComponent(towerId,CircleColliderComponent);
  if (!origin || !towerCol || !world.hasComponent(towerId,TowerComponent)) return null;
  const valid=id=>{
    const health=world.getComponent(id,HealthComponent),position=world.getComponent(id,TransformComponent);
    return health?.current>0 && position && !world.destructionQueue.has(id) && canEnemyMelee(world,id) &&
      isCombatTargetAvailable(world,id) && Math.hypot(position.x-origin.x,position.y-origin.y)<=range;
  };
  if (target.contactTargetId!=null && world.getComponent(target.contactTargetId,HealthComponent)===target.contactTargetHealth && valid(target.contactTargetId)) return target.contactTargetId;
  target.contactTargetId=null;target.contactTargetHealth=null;
  let chosen=null,nearest=Infinity;
  for (const id of candidates || world.getEntitiesWith(EnemyComponent,TransformComponent,CircleColliderComponent,HealthComponent)) {
    const position=world.getComponent(id,TransformComponent),col=world.getComponent(id,CircleColliderComponent);
    if(!position||!col)continue;
    const distance=(position.x-origin.x)**2+(position.y-origin.y)**2;
    if (distance<=(towerCol.radius+col.radius+3)**2 && distance<nearest && valid(id)) {chosen=id;nearest=distance;}
  }
  if (chosen!=null) {target.contactTargetId=chosen;target.contactTargetHealth=world.getComponent(chosen,HealthComponent);}
  return chosen;
}
