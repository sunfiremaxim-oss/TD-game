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
import { VelocityComponent } from '../src/components/VelocityComponent.js';
import { CitadelComponent, CitadelGeneratorComponent } from '../src/components/CitadelComponent.js';
import { WaveSystem } from '../src/systems/WaveSystem.js';
import { MovementSystem } from '../src/systems/MovementSystem.js';
import { PhysicsSeparationSystem } from '../src/systems/PhysicsSeparationSystem.js';
import { CitadelAISystem } from '../src/systems/CitadelAISystem.js';
import { DamageSystem } from '../src/systems/DamageSystem.js';
import { TargetingSystem } from '../src/systems/TargetingSystem.js';
import { WeaponSystem } from '../src/systems/WeaponSystem.js';
import { CollisionSystem } from '../src/systems/CollisionSystem.js';
import { calculateMitigatedDamage, getExpectedInFlightDamage } from '../src/combat/DamageCalculation.js';
import { isCitadelProtected, getCitadelStopRadius, getCitadelGeneratorMask } from '../src/combat/CitadelMechanics.js';
import { CitadelShieldVisual, getCitadelShieldRadius } from '../src/visuals/CitadelVisual.js';
import { EnemyVisualCache, ProjectileVisualCache } from '../src/visuals/BattleVisualCache.js';
import { RenderSystem } from '../src/systems/RenderSystem.js';
import { EconomyComponent } from '../src/components/EconomyComponent.js';
import { EconomySystem } from '../src/systems/EconomySystem.js';
import { PlayerProgress } from '../src/managers/PlayerProgress.js';

function scene({fire=false,damage=400,range=130,hp=10000}={}) {
  const world=new World(),tower=world.createEntity(),health=new HealthComponent(hp,hp);
  for(const c of [new TowerComponent(),new TransformComponent(600,400),new CircleColliderComponent(26,1000,true),health,
    new AttackComponent(damage,2,range,0,0,1.6,1,0,0),new ArmorComponent(),new DefenseComponent(),new TargetComponent()]) world.addComponent(tower,c);
  const damages=new DamageSystem();
  for(const s of [new MovementSystem(),new PhysicsSeparationSystem(),new CitadelAISystem(),new TargetingSystem(),
    ...(fire?[new WeaponSystem()]:[]),new CollisionSystem(),damages]) world.registerSystem(s);
  const waves=new WaveSystem();waves.stageId=5;waves.currentWave=20;
  const stop=getCitadelStopRadius(26,range,true),boss=waves._spawnEnemy(world,'boss_citadel',{x:600+stop,y:400,rotation:0});
  return {world,tower,health,boss,waves,damages,stop,bossHp:world.getComponent(boss,HealthComponent),citadel:world.getComponent(boss,CitadelComponent)};
}
function advance(world,seconds,dt=1/60) {
  for(let t=0;t<seconds-1e-9&&!world.isGameOver;) {const step=Math.min(dt,(seconds-t)/world.gameSpeed);world.update(step);t+=step*world.gameSpeed;}
}
function killPart(run,part) {run.damages._applyDamageToEntity(run.world,part.id,1e9,false);}

test('stage five spawns a hexagonal Citadel with six separate, correctly scaled modules',()=>{
  const run=scene();assert.equal(STAGES[4].boss,'boss_citadel');
  assert.deepEqual(run.waves._generateWaveEnemies(20),['boss_citadel']);
  assert.equal(GameConfig.enemies.boss_citadel.sides,6);
  assert.equal(run.bossHp.max,Math.round(260*1.1**19*1.25**4));
  assert.equal(run.citadel.generators.length,6);assert.equal(run.world.getEntitiesWith(EnemyComponent).length,7);
  assert.equal(run.waves.totalEnemiesInWave,6); // Parent is counted by the caller when dequeued.
  for(const part of run.citadel.generators) {
    assert.equal(part.health.max,Math.round(28*1.1**19*1.25**4));
    assert.equal(run.world.getComponent(part.id,EnemyComponent).baseReward,0);
    assert.ok(run.world.getComponent(part.id,CitadelGeneratorComponent));
  }
});

test('hull is untargetable and fully invulnerable until all six generators die, without life steal',()=>{
  const run=scene(),defense=run.world.getComponent(run.tower,DefenseComponent);
  run.health.current=5000;defense.lifeSteal=.5;defense.lifeStealBudget=1000;
  let hits=0;run.world.eventBus.on('DAMAGE_DEALT',()=>hits++);
  run.damages._applyDamageToEntity(run.world,run.boss,1e6,false,0,0,{sourceId:run.tower,kind:'projectile'});
  assert.equal(run.bossHp.current,run.bossHp.max);assert.equal(run.health.current,5000);assert.equal(hits,0);
  new TargetingSystem().update(run.world,.01);
  assert.notEqual(run.world.getComponent(run.tower,TargetComponent).targetEntityId,run.boss);
  const parts=[...run.citadel.generators];
  for(let i=0;i<5;i++){killPart(run,parts[i]);assert.equal(calculateMitigatedDamage(run.world,run.boss,100),0);}
  killPart(run,parts[5]);assert.equal(calculateMitigatedDamage(run.world,run.boss,100),100);
  advance(run.world,1);assert.equal(run.citadel.hullExposed,true);
  assert.equal(run.world.getEntitiesWith(CitadelGeneratorComponent).length,0);
  advance(run.world,40);assert.equal(run.world.getEntitiesWith(CitadelGeneratorComponent).length,0);
  run.damages._applyDamageToEntity(run.world,run.boss,100,false);assert.equal(run.bossHp.current,run.bossHp.max-100);
});

test('rotation preserves six fixed slots, spacing, distance and pause at x1/x3',()=>{
  for(const speed of [1,3]) {
    const run=scene();run.world.gameSpeed=speed;const rotation=run.world.getComponent(run.boss,TransformComponent).rotation;
    advance(run.world,2);const parent=run.world.getComponent(run.boss,TransformComponent);
    assert.ok(Math.abs(parent.rotation-rotation)>.9);
    for(let slot=0;slot<6;slot++) {
      const point=run.world.getComponent(run.citadel.generators[slot].id,TransformComponent),angle=parent.rotation+slot*Math.PI/3;
      assert.ok(Math.abs(point.x-parent.x-Math.cos(angle)*GameConfig.enemies.boss_citadel.generatorOrbit)<1e-7);
      assert.ok(Math.abs(point.y-parent.y-Math.sin(angle)*GameConfig.enemies.boss_citadel.generatorOrbit)<1e-7);
      assert.ok(Math.hypot(point.x-600,point.y-400)>26+14);
    }
    const before=parent.rotation;run.world.isPaused=true;advance(run.world,1);assert.equal(parent.rotation,before);
  }
});

test('destroyed slots never attach recycled IDs, even a different generator claiming the same owner',()=>{
  const run=scene(),part=run.citadel.generators[0];killPart(run,part);run.world._flushDestructionQueue();
  const reused=run.world.createEntity();assert.equal(reused,part.id);
  const newHp=new HealthComponent(10,10),position=new TransformComponent(25,25);
  for(const c of [newHp,position,new EnemyComponent('citadel_generator'),new CitadelGeneratorComponent(run.boss,run.bossHp,0)])run.world.addComponent(reused,c);
  advance(run.world,.1);assert.equal(run.citadel.generators[0],null);assert.equal(position.x,25);assert.equal(position.y,25);
  assert.equal(isCitadelProtected(run.world,run.boss),true);
});

test('actual wave spawn reports seven targets, and dead modules never trigger premature victory',()=>{
  const world=new World(),waves=new WaveSystem();waves.startFirstWave(world,5);
  waves.currentWave=20;waves._startWave(world);
  let progress;world.eventBus.on('WAVE_PROGRESS',event=>progress=event);
  waves.update(world,.5);
  assert.equal(progress.total,7);assert.equal(progress.spawned,7);assert.equal(progress.alive,7);
  assert.equal(waves.totalEnemiesInWave,7);assert.equal(waves.enemiesSpawned,7);
  assert.equal(world.isGameOver,false);
});

test('shot cadence and rotation use simulation time consistently at different frame rates and game speeds',()=>{
  for(const dt of [1/320,1/60,.2])for(const speed of [1,3]) {
    const run=scene();run.world.gameSpeed=speed;advance(run.world,13,dt);
    assert.equal(run.citadel.shots,4,`dt ${dt}, speed ${speed}`);
    assert.ok(Number.isFinite(run.world.getComponent(run.boss,TransformComponent).rotation));
  }
});

test('direct boss deletion removes orphan modules, even if its ID is reused, without rewards',()=>{
  const run=scene();let deaths=0;run.world.eventBus.on('ENTITY_DIED',()=>deaths++);
  run.world.destroyEntity(run.boss);run.world._flushDestructionQueue();
  const reused=run.world.createEntity();assert.equal(reused,run.boss);run.world.addComponent(reused,new HealthComponent(100,100));
  advance(run.world,.1);assert.equal(run.world.getEntitiesWith(CitadelGeneratorComponent).length,0);assert.equal(deaths,0);
});

test('a bullet can cross the protected hull and ricochet to another generator without hitting the hull',()=>{
  const run=scene(),part=run.citadel.generators[0],position=run.world.getComponent(part.id,TransformComponent);
  const attack=run.world.getComponent(run.tower,AttackComponent);attack.ricochetChance=1;attack.ricochetCount=2;
  new WeaponSystem()._spawnProjectile(run.world,run.tower,run.world.getComponent(run.tower,TransformComponent),part.id,position,100,false,0,attack);
  const bullet=run.world.getEntitiesWith(ProjectileComponent)[0],bulletPos=run.world.getComponent(bullet,TransformComponent);
  const hull=run.world.getComponent(run.boss,TransformComponent);bulletPos.x=hull.x;bulletPos.y=hull.y;
  new CollisionSystem().update(run.world,0);assert.equal(run.world.destructionQueue.has(bullet),false);assert.equal(run.bossHp.current,run.bossHp.max);
  bulletPos.x=position.x;bulletPos.y=position.y;new CollisionSystem().update(run.world,0);
  const shot=run.world.getComponent(bullet,ProjectileComponent);assert.notEqual(shot.targetEntityId,run.boss);assert.notEqual(shot.targetEntityId,part.id);
  assert.equal(shot.ricochetsRemaining,1);assert.equal(part.health.current,part.health.max-100);
});

test('incoming-damage prediction reserves hits for generators and zero damage for the closed hull',()=>{
  const run=scene(),part=run.citadel.generators[0];
  for(const target of [run.boss,part.id]) {const id=run.world.createEntity();run.world.addComponent(id,new ProjectileComponent(run.tower,target,0,3,100));}
  const prediction=getExpectedInFlightDamage(run.world);assert.equal(prediction.get(run.boss),0);assert.equal(prediction.get(part.id),100);
});

test('all six generators remain reachable and the ordinary automatic weapon finishes the fight at base/long range',()=>{
  for(const range of [130,400,1750]) for(const speed of [1,3]) {
    const run=scene({fire:true,range});run.world.gameSpeed=speed;
    const killed=[];run.world.eventBus.on('ENTITY_DIED',event=>killed.push(event.enemyType));
    advance(run.world,60);
    assert.equal(killed.filter(type=>type==='citadel_generator').length,6,`range ${range}, x${speed}`);
    assert.equal(run.bossHp.current,0);assert.ok(run.health.current>0);
    assert.equal(killed.at(-1),'boss_citadel');
  }
});

test('rapid fire and multishot can attack separate modules while the hull stays protected',()=>{
  const run=scene({fire:true,range:400}),attack=run.world.getComponent(run.tower,AttackComponent);
  attack.multishotChance=1;attack.multishotCount=4;attack.rapidFireChance=1;attack.rapidFireDuration=2;
  advance(run.world,.01);const shots=run.world.getEntitiesWith(ProjectileComponent).map(id=>run.world.getComponent(id,ProjectileComponent)).filter(p=>!p.isEnemy);
  assert.ok(shots.length>=2);assert.equal(new Set(shots.map(p=>p.targetEntityId)).size,shots.length);
  assert.ok(shots.every(p=>p.targetEntityId!==run.boss));assert.ok(attack.rapidFireRemaining>0);
});

test('heavy plasma has a finite lifetime, damages the tower, obeys armor and cannot reflect into a protected hull',()=>{
  const run=scene(),armor=run.world.getComponent(run.tower,ArmorComponent),defense=run.world.getComponent(run.tower,DefenseComponent);
  armor.flatReduction=10;armor.percentReduction=.2;defense.damageReflection=1;
  const damage=run.world.getComponent(run.boss,EnemyComponent).damage;
  advance(run.world,2.4);assert.equal(run.citadel.shots,1);
  assert.equal(run.health.current,10000-Math.round((damage-10)*.8));assert.equal(run.bossHp.current,run.bossHp.max);
  advance(run.world,.5);advance(run.world,1.6);
  const shot=run.world.getEntitiesWith(ProjectileComponent).map(id=>run.world.getComponent(id,ProjectileComponent)).find(p=>p.isHeavyPlasma);
  assert.ok(shot);assert.equal(shot.sourceHealth,run.bossHp);assert.ok(Number.isFinite(shot.maxLifetime));
});

test('victory requires all six modules and hull; pays once and unlocks level six',()=>{
  const run=scene(),eco=new EconomyComponent();eco.crystalDropChance=0;
  run.world.addComponent(run.tower,eco);run.world.stageId=5;
  run.waves.state='ACTIVE';run.waves.totalEnemiesInWave=run.waves.enemiesSpawned=7;
  run.world.registerSystem(run.waves);run.world.registerSystem(new EconomySystem());
  const values=new Map(),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};
  const progress=new PlayerProgress(storage);progress.init(run.world);for(let stage=1;stage<=4;stage++)progress.credit(0,stage);
  let wins=0,payments=0;run.world.eventBus.on('STAGE_COMPLETED',()=>wins++);run.world.eventBus.on('RUN_CRYSTALS_SETTLED',()=>payments++);
  for(const part of [...run.citadel.generators])killPart(run,part);
  run.world.update(.01);assert.equal(wins,0);assert.equal(payments,0);
  run.damages._applyDamageToEntity(run.world,run.boss,1e9,false);run.world.update(.01);
  assert.equal(run.world.runOutcome,'victory');assert.equal(progress.completedStages,5);assert.equal(progress.isStageUnlocked(6),true);
  assert.equal(progress.crystals,21);assert.equal(wins,1);assert.equal(payments,1);
  run.waves._completeWave(run.world);run.world.eventBus.emit('STAGE_COMPLETED',{stage:5});assert.equal(progress.crystals,21);assert.equal(payments,1);
});

function context() {
  const calls=[],stack=[],ctx={calls,globalAlpha:1,shadowBlur:0,createRadialGradient(){calls.push('gradient');return{addColorStop(){}};},save(){stack.push({globalAlpha:this.globalAlpha,shadowBlur:this.shadowBlur});},
    restore(){Object.assign(this,stack.pop());},drawImage(){calls.push('image');}};
  return new Proxy(ctx,{get:(o,k)=>o[k]??(()=>calls.push(k)),set(o,k,v){if(k==='shadowBlur'&&v>0)calls.push('blur');o[k]=v;return true;}});
}
test('hull, six modules and plasma reuse bounded sprites without live glow or growing animation caches',()=>{
  const canvases=[],output=context(),renderer=Object.create(RenderSystem.prototype);
  const create=()=>{const c={getContext:()=>context()};canvases.push(c);return c;};
  const cache=new EnemyVisualCache(create),plasma=new ProjectileVisualCache(create);
  const draw=()=>{
    for(const phase of ['protected','exposed'])cache.draw(output,renderer,'boss_citadel',GameConfig.enemies.boss_citadel,.75,1,phase);
    for(let i=0;i<6;i++)cache.draw(output,renderer,'citadel_generator',GameConfig.enemies.citadel_generator,.75,1);
    plasma.draw(output,{radius:9,glowBlur:15,color:'#ddfaff',glowColor:'#69bfff'},{isEnemy:true,isHeavyPlasma:true},1);
  };
  draw();const count=canvases.length;output.calls.length=0;for(let i=0;i<300;i++)draw();
  assert.equal(count,7);assert.equal(canvases.length,count);
  assert.equal(output.calls.some(c=>['blur','stroke','fill','beginPath','createLinearGradient'].includes(c)),false);
  assert.ok(canvases.reduce((sum,c)=>sum+c.width*c.height*4,0)<2*1024*1024);
});

test('shield uses a bounded Aegis atlas and cached feeds, with no live mesh or blur',()=>{
  const canvases=[],output=context(),visual=new CitadelShieldVisual(()=>{const c={getContext:()=>context()};canvases.push(c);return c;});
  assert.ok(getCitadelShieldRadius()>GameConfig.enemies.boss_citadel.generatorOrbit+GameConfig.enemies.citadel_generator.radius);
  visual.draw(output,63,0,0,1.5);assert.equal(canvases.length,3);output.calls.length=0;
  for(let frame=0;frame<240;frame++)visual.draw(output,63,frame/60,frame*.008,1.5);
  assert.equal(canvases.length,3);
  const images=output.calls.filter(call=>call==='image').length;
  assert.ok(images>=7*240&&images<=8*240);
  assert.equal(output.calls.some(call=>['blur','stroke','fill','beginPath','gradient'].includes(call)),false);
  assert.ok(canvases.reduce((sum,c)=>sum+c.width*c.height*4,0)<4.3*1024*1024);
});

test('each destroyed module removes only its feed; the membrane disappears exactly after the sixth',()=>{
  const run=scene(),renderer=Object.create(RenderSystem.prototype),calls=[];
  renderer.citadelShieldVisual={draw(_ctx,mask){calls.push(mask);}};
  const output=context();assert.equal(getCitadelGeneratorMask(run.world,run.citadel),63);
  renderer._drawCitadelShields(output,run.world);assert.deepEqual(calls,[63]);
  killPart(run,run.citadel.generators[2]);calls.length=0;
  renderer._drawCitadelShields(output,run.world);assert.deepEqual(calls,[59]);
  for(const part of run.citadel.generators)if(part?.health.current>0)killPart(run,part);
  calls.length=0;renderer._drawCitadelShields(output,run.world);assert.deepEqual(calls,[]);
  const visual=new CitadelShieldVisual(()=>{throw Error('Unpowered shield must not allocate a texture');});
  visual.draw(output,0,0,0);assert.equal(visual.emitter,null);
});
