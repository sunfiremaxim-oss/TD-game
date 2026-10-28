import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/core/World.js';
import { TowerComponent } from '../src/components/TowerComponent.js';
import { TransformComponent } from '../src/components/TransformComponent.js';
import { CircleColliderComponent } from '../src/components/CircleColliderComponent.js';
import { EnemyComponent } from '../src/components/EnemyComponent.js';
import { HealthComponent } from '../src/components/HealthComponent.js';
import { AttackComponent } from '../src/components/AttackComponent.js';
import { TargetComponent } from '../src/components/TargetComponent.js';
import { ProjectileComponent } from '../src/components/ProjectileComponent.js';
import { RenderComponent } from '../src/components/RenderComponent.js';
import { FractalComponent,FractalBranchComponent } from '../src/components/FractalComponent.js';
import { TargetingSystem } from '../src/systems/TargetingSystem.js';
import { WeaponSystem } from '../src/systems/WeaponSystem.js';
import { CollisionSystem } from '../src/systems/CollisionSystem.js';
import { DamageSystem } from '../src/systems/DamageSystem.js';
import { RenderSystem } from '../src/systems/RenderSystem.js';
import { UIManager } from '../src/ui/UIManager.js';

function add(world,...parts){const id=world.createEntity();for(const part of parts)world.addComponent(id,part);return id;}
function scene(){
  const world=new World(),target=new TargetComponent(),attack=new AttackComponent(25,1.6,130,0,0,1.6,2,0,0);
  const tower=add(world,new TowerComponent(),new TransformComponent(600,400),new CircleColliderComponent(26,1000,true),new HealthComponent(10000,10000),target,attack);
  const enemy=(x,type='scout')=>add(world,new EnemyComponent(type,1,false,0,1,0,0,31),new TransformComponent(x,400),new CircleColliderComponent(14),new HealthComponent(100,100),new RenderComponent('polygon',3,14,'#ffee00','#ffee00',8));
  const aiming=new TargetingSystem();aiming.init(world);
  const weapon=new WeaponSystem(),damage=new DamageSystem();damage.init(world);
  return{world,tower,target,attack,enemy,aiming,weapon,damage};
}
test('contact focus survives closer arrivals and small separations; aiming and primary volley agree',()=>{
  const s=scene(),first=s.enemy(640),second=s.enemy(645);
  s.aiming.update(s.world,.01);assert.equal(s.target.targetEntityId,first);
  s.world.getComponent(second,TransformComponent).x=637;s.world.getComponent(first,TransformComponent).x=646;
  s.aiming.update(s.world,.01);s.weapon.update(s.world,.01);
  assert.equal(s.target.targetEntityId,first);
  assert.equal(s.world.getComponent(s.world.getEntitiesWith(ProjectileComponent)[0],ProjectileComponent).targetEntityId,first);
  s.damage._applyDamageToEntity(s.world,first,1000,false);s.aiming.update(s.world,.01);
  assert.equal(s.target.targetEntityId,second);assert.equal(s.target.contactTargetId,second);
});
test('predicted death keeps focus until the hit; multishot still has distinct secondary targets',()=>{
  const s=scene(),first=s.enemy(640),second=s.enemy(642);s.aiming.update(s.world,.01);
  add(s.world,new ProjectileComponent(s.tower,first,0,3,100));
  s.weapon.update(s.world,.01);assert.equal(s.world.getEntitiesWith(ProjectileComponent).length,1);assert.equal(s.target.targetEntityId,first);
  for(const id of s.world.getEntitiesWith(ProjectileComponent))s.world.destroyEntity(id);
  s.world._flushDestructionQueue();s.attack.multishotChance=1;s.attack.multishotCount=2;s.weapon.update(s.world,.01);
  const shots=s.world.getEntitiesWith(ProjectileComponent).map(id=>s.world.getComponent(id,ProjectileComponent));
  assert.deepEqual(shots.map(p=>p.targetEntityId),[first,second]);
});
test('recycled IDs and targets displaced outside range release contact focus',()=>{
  const s=scene(),first=s.enemy(640),second=s.enemy(642);s.aiming.update(s.world,.01);
  s.world.destroyEntity(first);s.world._flushDestructionQueue();
  const reused=s.enemy(900);assert.equal(reused,first);s.aiming.update(s.world,.01);assert.equal(s.target.targetEntityId,second);
  s.world.getComponent(second,TransformComponent).x=900;s.world.getComponent(reused,TransformComponent).x=640;
  s.aiming.update(s.world,.01);assert.equal(s.target.targetEntityId,reused);
});
test('contact animation triggers on actual attacks, pauses, and does not move physics or add damage',()=>{
  const s=scene(),id=s.enemy(640),enemy=s.world.getComponent(id,EnemyComponent),collision=new CollisionSystem();
  let contacts=0;s.world.eventBus.on('TOWER_CONTACT',()=>contacts++);s.world.registerSystem(collision);
  s.world.update(.01);assert.equal(contacts,1);assert.equal(enemy.meleeAttackRemaining,.18);
  assert.equal(s.world.getComponent(s.tower,HealthComponent).current,9969);
  s.world.update(.09);assert.ok(Math.abs(enemy.meleeAttackRemaining-.09)<1e-8);assert.equal(contacts,1);
  s.world.isPaused=true;s.world.update(1);assert.ok(Math.abs(enemy.meleeAttackRemaining-.09)<1e-8);
  assert.equal(s.world.getComponent(id,TransformComponent).x,640);
  const renderer=Object.create(RenderSystem.prototype),translations=[],scales=[];
  renderer.enemyVisualCache={draw(){}};renderer.canvas={pixelRatio:1};
  const ctx={globalAlpha:1,save(){},restore(){},translate(...a){translations.push(a);},rotate(){},scale(...a){scales.push(a);}};
  renderer._drawEnemies(ctx,s.world);assert.ok(translations[0][0]<640);assert.ok(scales[0][0]>1);
  assert.equal(enemy.meleeAttackRemaining,.09);assert.equal(s.world.getComponent(id,TransformComponent).x,640);
});
test('ranged enemies and attached Fractal branches never produce a melee attack animation',()=>{
  const s=scene(),ranged=s.enemy(640,'boss_railgun'),branch=s.enemy(640,'fractal_branch');
  s.world.addComponent(branch,new FractalBranchComponent(999,new HealthComponent(1,1),0));
  new CollisionSystem().update(s.world,.01);
  assert.equal(s.world.getComponent(ranged,EnemyComponent).meleeAttackRemaining,0);
  assert.equal(s.world.getComponent(branch,EnemyComponent).meleeAttackRemaining,0);
});
test('target HUD reflects live HP and current Fractal attack, hides stale targets and avoids duplicate text writes',()=>{
  const s=scene(),id=s.enemy(640,'boss_fractal'),node=()=>({hidden:true,textContent:'',style:{}});s.target.targetEntityId=id;
  s.world.addComponent(id,new FractalComponent());
  const ui=Object.assign(Object.create(UIManager.prototype),{world:s.world,
    dom:{targetInfo:node(),targetName:node(),targetHp:node(),targetDamage:node(),targetHpFill:node(),targetHpCompact:node(),targetDamageCompact:node()}});
  ui._updateTargetHUD();assert.equal(ui.dom.targetInfo.hidden,false);assert.equal(ui.dom.targetHp.textContent,'100 / 100');assert.equal(ui.dom.targetDamage.textContent,'6');
  s.world.getComponent(id,HealthComponent).current=43;ui._updateTargetHUD();assert.equal(ui.dom.targetHp.textContent,'43 / 100');
  assert.equal(ui.dom.targetHpCompact.textContent,'43');assert.equal(ui.dom.targetHpCompact.title,'43 / 100');
  assert.equal(ui.dom.targetDamageCompact.textContent,'6');
  Object.assign(s.world.getComponent(id,HealthComponent),{current:1250000,max:2000000});
  s.world.getComponent(id,EnemyComponent).damage=50000;ui._updateTargetHUD();
  assert.equal(ui.dom.targetHpCompact.textContent,'1.3M');assert.equal(ui.dom.targetDamageCompact.textContent,'10K');
  assert.match(ui.dom.targetHp.textContent,/1.*250.*000.*2.*000.*000/,'full values remain available on desktop');
  let writes=0;Object.defineProperty(ui.dom.targetHp,'textContent',{set(){writes++;}});ui._updateTargetHUD();assert.equal(writes,0);
  s.world.destroyEntity(id);ui._updateTargetHUD();assert.equal(ui.dom.targetInfo.hidden,true);
});
