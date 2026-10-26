import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/core/World.js';
import { GameConfig } from '../src/config/GameConfig.js';
import { STAGES } from '../src/config/StageConfig.js';
import { TowerComponent } from '../src/components/TowerComponent.js';
import { TransformComponent } from '../src/components/TransformComponent.js';
import { CircleColliderComponent } from '../src/components/CircleColliderComponent.js';
import { HealthComponent } from '../src/components/HealthComponent.js';
import { AttackComponent } from '../src/components/AttackComponent.js';
import { ArmorComponent } from '../src/components/ArmorComponent.js';
import { DefenseComponent } from '../src/components/DefenseComponent.js';
import { EnemyComponent } from '../src/components/EnemyComponent.js';
import { TargetComponent } from '../src/components/TargetComponent.js';
import { ProjectileComponent } from '../src/components/ProjectileComponent.js';
import { RailgunComponent } from '../src/components/RailgunComponent.js';
import { WaveSystem } from '../src/systems/WaveSystem.js';
import { MovementSystem } from '../src/systems/MovementSystem.js';
import { PhysicsSeparationSystem } from '../src/systems/PhysicsSeparationSystem.js';
import { RailgunAISystem } from '../src/systems/RailgunAISystem.js';
import { DamageSystem } from '../src/systems/DamageSystem.js';
import { TargetingSystem } from '../src/systems/TargetingSystem.js';
import { WeaponSystem } from '../src/systems/WeaponSystem.js';
import { CollisionSystem } from '../src/systems/CollisionSystem.js';
import { calculateMitigatedDamage,getExpectedInFlightDamage } from '../src/combat/DamageCalculation.js';
import { getRailgunOrbitRadius } from '../src/combat/RailgunMechanics.js';
import { EnemyVisualCache } from '../src/visuals/BattleVisualCache.js';
import { RenderSystem } from '../src/systems/RenderSystem.js';
import { EconomyComponent } from '../src/components/EconomyComponent.js';
import { EconomySystem } from '../src/systems/EconomySystem.js';
import { PlayerProgress } from '../src/managers/PlayerProgress.js';

function scene(fire=false,hp=10000,damage=241,range=130) {
  const world=new World(),tower=world.createEntity(),health=new HealthComponent(hp,hp);
  for(const c of [new TowerComponent(),new TransformComponent(600,400),new CircleColliderComponent(26,1000,true),health,
    new AttackComponent(damage,1.6,range,0,0,1.6,1,0,0),new ArmorComponent(),new DefenseComponent(),new TargetComponent()]) world.addComponent(tower,c);
  const damages=new DamageSystem();
  for(const s of [new MovementSystem(),new PhysicsSeparationSystem(),new RailgunAISystem(),new TargetingSystem(),
    ...(fire?[new WeaponSystem()]:[]),new CollisionSystem(),damages]) world.registerSystem(s);
  const waves=new WaveSystem(); waves.stageId=4; waves.currentWave=20;
  const orbit=getRailgunOrbitRadius(26,62,range),boss=waves._spawnEnemy(world,'boss_railgun',{x:600+orbit,y:400});
  return {world,tower,health,boss,waves,damages,orbit,rail:world.getComponent(boss,RailgunComponent),bossHp:world.getComponent(boss,HealthComponent)};
}
function advance(world,seconds,dt=1/60) {
  for(let t=0;t<seconds-1e-9&&!world.isGameOver;) {const step=Math.min(dt,(seconds-t)/world.gameSpeed);world.update(step);t+=step*world.gameSpeed;}
}

test('stage four has one independent sniper boss, still reachable with base range',()=>{
  const run=scene(); assert.equal(STAGES[3].boss,'boss_railgun');
  assert.deepEqual(run.waves._generateWaveEnemies(20),['boss_railgun']);
  assert.equal(run.bossHp.max,Math.round(360*1.1**19*1.25**3));
  assert.equal(run.world.getComponent(run.boss,EnemyComponent).damage,Math.round(24*1.07**19*1.15**3));
  assert.ok(run.orbit<130 && run.orbit>26+62);
  assert.deepEqual(run.world.getEntitiesWith(EnemyComponent),[run.boss]);
});
test('charge gives no early damage; shot is one hit, cooling is vulnerable and reposition moves laterally',()=>{
  const run=scene(),pos=run.world.getComponent(run.boss,TransformComponent);
  const x=pos.x,y=pos.y; advance(run.world,1.59); assert.equal(run.health.current,10000);
  assert.equal(pos.x,x); assert.equal(pos.y,y); assert.equal(run.rail.phase,'charge');
  advance(run.world,.01); assert.equal(run.rail.shots,1); assert.equal(run.rail.phase,'firing');
  assert.equal(run.health.current,10000-run.world.getComponent(run.boss,EnemyComponent).damage);
  advance(run.world,.22); assert.equal(run.rail.phase,'cooldown');
  assert.equal(calculateMitigatedDamage(run.world,run.boss,100),135);
  advance(run.world,1.1); assert.equal(run.rail.phase,'reposition');
  advance(run.world,1); assert.ok(Math.abs(pos.y-y)>10); assert.equal(run.rail.shots,1);
  assert.equal(run.world.getEntitiesWith(ProjectileComponent).length,0);
});
test('shot counts and damage agree across frame rates and x1/x3, including long frames',()=>{
  for(const dt of [1/320,1/60,.1,.7]) for(const speed of [1,3]) {
    const run=scene(); run.world.gameSpeed=speed; advance(run.world,20,dt);
    assert.equal(run.rail.shots,4,`dt=${dt}, speed=${speed}`);
    assert.equal(run.health.current,10000-4*run.world.getComponent(run.boss,EnemyComponent).damage);
  }
});
test('pause, displacement, knockback, queued death and missing tower cannot fire a stale charge',()=>{
  const run=scene(); advance(run.world,1); run.world.isPaused=true; advance(run.world,2);
  assert.equal(run.rail.shots,0); assert.ok(Math.abs(run.rail.phaseRemaining-.6)<1e-8);
  run.world.isPaused=false;
  run.world.getComponent(run.boss,EnemyComponent).knockbackRemaining=.2;
  run.world.update(.01); assert.equal(run.rail.phase,'approach'); assert.equal(run.rail.shots,0);
  const removed=scene(); removed.world.destroyEntity(removed.boss); advance(removed.world,10); assert.equal(removed.health.current,10000);
  const targetless=scene(); targetless.world.destroyEntity(targetless.tower); advance(targetless.world,10); assert.equal(targetless.rail.shots,0);
  const displaced=scene(); advance(displaced.world,1); displaced.world.getComponent(displaced.boss,TransformComponent).x+=100;
  displaced.world.update(.01); assert.equal(displaced.rail.phase,'approach'); assert.equal(displaced.rail.shots,0);
});
test('beam respects tower armor and reflection can kill its source without a second shot in a long frame',()=>{
  const run=scene(); const armor=run.world.getComponent(run.tower,ArmorComponent); armor.flatReduction=10;armor.percentReduction=.5;
  advance(run.world,1.6); const raw=run.world.getComponent(run.boss,EnemyComponent).damage;
  assert.equal(run.health.current,10000-Math.round((raw-10)*.5));
  const reflected=scene(); reflected.bossHp.current=1; reflected.world.getComponent(reflected.tower,DefenseComponent).damageReflection=1;
  reflected.world.update(20); assert.equal(reflected.rail.shots,1); assert.equal(reflected.bossHp.current,0);
});
test('cooling mitigation matches bullet prediction and actual damage',()=>{
  const run=scene(); run.rail.phase='cooldown';run.rail.phaseRemaining=1;
  const p=run.world.createEntity(); run.world.addComponent(p,new ProjectileComponent(run.tower,run.boss,0,3,100));
  assert.equal(getExpectedInFlightDamage(run.world).get(run.boss),135);
  const before=run.bossHp.current;run.damages._applyDamageToEntity(run.world,run.boss,100,false);
  assert.equal(before-run.bossHp.current,135);
});
test('a prepared build wins the isolated stage-four encounter, basic offense loses',()=>{
  for(const speed of [1,3]) for(const [damage,hp,win] of [[241,700,true],[25,300,false]]) {
    const run=scene(true,hp,damage);run.world.gameSpeed=speed;advance(run.world,90);
    if(win) {assert.equal(run.bossHp.current,0);assert.ok(run.health.current>0);}
    else {assert.equal(run.health.current,0);assert.ok(run.bossHp.current>0);}
  }
});
test('stage-four victory pays the final wave once and unlocks stage five',()=>{
  const run=scene(),eco=new EconomyComponent();eco.crystalDropChance=0;
  run.world.addComponent(run.tower,eco);run.world.stageId=4;
  run.waves.state='ACTIVE';run.waves.totalEnemiesInWave=run.waves.enemiesSpawned=1;
  run.world.registerSystem(run.waves);run.world.registerSystem(new EconomySystem());
  const values=new Map(),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};
  const progress=new PlayerProgress(storage);progress.init(run.world);progress.credit(0,1);progress.credit(0,2);progress.credit(0,3);
  let wins=0,payments=0;
  run.world.eventBus.on('STAGE_COMPLETED',()=>wins++);run.world.eventBus.on('RUN_CRYSTALS_SETTLED',()=>payments++);
  run.damages._applyDamageToEntity(run.world,run.boss,1e9,false);run.world.update(1/60);
  assert.equal(run.world.runOutcome,'victory');assert.equal(progress.completedStages,4);
  assert.equal(progress.isStageUnlocked(5),true);assert.equal(progress.crystals,21);assert.equal(wins,1);assert.equal(payments,1);
  run.waves._completeWave(run.world);run.world.eventBus.emit('STAGE_COMPLETED',{stage:4});
  assert.equal(progress.crystals,21);assert.equal(payments,1);
});

function context() {
  const calls=[], stack=[];const ctx={calls,globalAlpha:1,shadowBlur:0,
    save(){stack.push({globalAlpha:this.globalAlpha,shadowBlur:this.shadowBlur});},restore(){Object.assign(this,stack.pop());},drawImage(){calls.push('image');}};
  return new Proxy(ctx,{get:(o,k)=>o[k]??(()=>calls.push(k)),set(o,k,v){if(k==='shadowBlur'&&v>0)calls.push('blur');o[k]=v;return true;}});
}
test('four hull states use at most eight cached sprites and no live geometry',()=>{
  const canvases=[],output=context(),renderer=Object.create(RenderSystem.prototype);
  const cache=new EnemyVisualCache(()=>{const c={getContext:()=>context()};canvases.push(c);return c;});
  const phases=['idle','charge','firing','cooldown'];
  for(const phase of phases)cache.draw(output,renderer,'boss_railgun',GameConfig.enemies.boss_railgun,.75,1,phase);
  assert.equal(canvases.length,8);output.calls.length=0;
  for(let i=0;i<600;i++)cache.draw(output,renderer,'boss_railgun',GameConfig.enemies.boss_railgun,.75,1,phases[i%4]);
  assert.equal(canvases.length,8);assert.equal(output.calls.filter(c=>c==='image').length,1200);
  assert.equal(output.calls.some(c=>['blur','stroke','fill','beginPath','createLinearGradient'].includes(c)),false);
  assert.ok(canvases.reduce((sum,c)=>sum+c.width*c.height*4,0)<=2*1024*1024);
});
