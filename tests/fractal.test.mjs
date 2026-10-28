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
import { FractalComponent, FractalBranchComponent } from '../src/components/FractalComponent.js';
import { getFractalStopRadius, getLiveFractalBranchCount } from '../src/combat/FractalMechanics.js';
import { WaveSystem } from '../src/systems/WaveSystem.js';
import { MovementSystem } from '../src/systems/MovementSystem.js';
import { PhysicsSeparationSystem } from '../src/systems/PhysicsSeparationSystem.js';
import { FractalAISystem } from '../src/systems/FractalAISystem.js';
import { DamageSystem } from '../src/systems/DamageSystem.js';
import { TargetingSystem } from '../src/systems/TargetingSystem.js';
import { WeaponSystem } from '../src/systems/WeaponSystem.js';
import { CollisionSystem } from '../src/systems/CollisionSystem.js';
import { calculateMitigatedDamage } from '../src/combat/DamageCalculation.js';
import { EconomyComponent } from '../src/components/EconomyComponent.js';
import { EconomySystem } from '../src/systems/EconomySystem.js';
import { PlayerProgress } from '../src/managers/PlayerProgress.js';
import { EnemyVisualCache } from '../src/visuals/BattleVisualCache.js';
import { drawFractalCore, drawFractalBranch, drawFractalHealth, FractalDischargeVisual, FractalChargeVisual } from '../src/visuals/FractalVisual.js';

function scene({fire=false,damage=500,range=130,hp=100000}={}) {
  const world=new World(),tower=world.createEntity(),health=new HealthComponent(hp,hp);
  for(const component of [new TowerComponent(),new TransformComponent(600,400),new CircleColliderComponent(26,1000,true),health,
    new AttackComponent(damage,2,range,0,0,1.6,1,0,0),new ArmorComponent(),new DefenseComponent(),new TargetComponent()])world.addComponent(tower,component);
  const damages=new DamageSystem(),ai=new FractalAISystem(),waves=new WaveSystem();
  waves.stageId=6;waves.currentWave=20;
  for(const system of [new MovementSystem(),new PhysicsSeparationSystem(),ai,new TargetingSystem(),
    ...(fire?[new WeaponSystem()]:[]),new CollisionSystem(),damages,waves])world.registerSystem(system);
  const stop=getFractalStopRadius(26,range),boss=waves._spawnEnemy(world,'boss_fractal',{x:600+stop,y:400,rotation:0});
  return {world,tower,health,boss,waves,damages,ai,stop,bossHp:world.getComponent(boss,HealthComponent),fractal:world.getComponent(boss,FractalComponent)};
}
function advance(world,seconds,dt=1/60) {
  for(let time=0;time<seconds-1e-9&&!world.isGameOver;) {
    const step=Math.min(dt,(seconds-time)/world.gameSpeed);world.update(step);time+=step*world.gameSpeed;
  }
}
function ofType(world,type) {
  return world.getEntitiesWith(EnemyComponent,HealthComponent).filter(id=>world.getComponent(id,EnemyComponent).type===type&&world.getComponent(id,HealthComponent).current>0);
}
function kill(run,id) {run.damages._applyDamageToEntity(run.world,id,1e9,false);}
function cfg() {return GameConfig.enemies.boss_fractal;}

test('level six finale spawns a vulnerable Fractal core and four independently targetable branches',()=>{
  const run=scene();assert.equal(STAGES[5].boss,'boss_fractal');
  assert.deepEqual(run.waves._generateWaveEnemies(20),['boss_fractal']);
  assert.equal(run.fractal.branches.length,4);assert.equal(ofType(run.world,'fractal_branch').length,4);
  assert.equal(run.world.getEntitiesWith(EnemyComponent).length,5);
  assert.equal(run.bossHp.max,Math.round(cfg().baseHp*1.1**19*1.25**5));
  assert.equal(calculateMitigatedDamage(run.world,run.boss,100),100);
  run.damages._applyDamageToEntity(run.world,run.boss,100,false);
  assert.equal(run.bossHp.current,run.bossHp.max-100);
  for(const part of run.fractal.branches) {
    assert.equal(part.health,run.world.getComponent(part.id,HealthComponent));
    assert.equal(part.health.max,Math.round(GameConfig.enemies.fractal_branch.baseHp*1.1**19*1.25**5));
    const branch=run.world.getComponent(part.id,FractalBranchComponent);
    assert.equal(branch.attached,true);assert.equal(branch.ownerHealth,run.bossHp);
  }
});

test('a real final-wave spawn reports all five targets without premature completion',()=>{
  const world=new World(),waves=new WaveSystem();waves.startFirstWave(world,6);waves.currentWave=20;waves._startWave(world);
  let progress;world.eventBus.on('WAVE_PROGRESS',event=>progress=event);waves.update(world,.5);
  assert.equal(progress.total,5);assert.equal(progress.spawned,5);assert.equal(progress.alive,5);
  assert.equal(world.isGameOver,false);
});

test('half-health detachment preserves remaining HP, removes contribution and releases physical movement',()=>{
  const run=scene(),part=run.fractal.branches[0],branch=run.world.getComponent(part.id,FractalBranchComponent);
  assert.equal(getLiveFractalBranchCount(run.world,run.fractal),4);
  const dealt=Math.ceil(part.health.max/2);run.damages._applyDamageToEntity(run.world,part.id,dealt,false);
  assert.equal(part.health.current,part.health.max-dealt);assert.equal(branch.attached,false);
  assert.equal(getLiveFractalBranchCount(run.world,run.fractal),3);
  assert.equal(run.world.getComponent(part.id,CircleColliderComponent).isStatic,false);
  const position=run.world.getComponent(part.id,TransformComponent),before={x:position.x,y:position.y};advance(run.world,.4);
  assert.ok(Math.hypot(position.x-before.x,position.y-before.y)>.01);
  assert.equal(ofType(run.world,'fractal_fragment').length,0,'a damaged live branch is not a new healed fragment');
});

test('detaching branches progressively weakens the single discharge hit without multiplying damage by forks',()=>{
  const damages=[];
  for(let detached=0;detached<=4;detached++) {
    const run=scene();
    for(let slot=0;slot<detached;slot++) {
      const part=run.fractal.branches[slot];run.damages._applyDamageToEntity(run.world,part.id,Math.ceil(part.health.max/2),false);
    }
    const hits=[];run.world.eventBus.on('TOWER_HIT',event=>hits.push(event));
    run.ai.update(run.world,cfg().chargeDuration+.001);
    assert.equal(hits.length,1);assert.equal(run.fractal.shots,1);
    assert.equal(hits[0].sourceId,run.boss);assert.equal(hits[0].sourceHealth,run.bossHp);
    const base=run.world.getComponent(run.boss,EnemyComponent).damage;
    const fraction=cfg().damageFloor+(1-cfg().damageFloor)*(4-detached)/4;
    assert.equal(hits[0].damage,Math.max(1,Math.round(base*fraction)));
    damages.push(hits[0].damage);
  }
  assert.ok(damages.every((damage,index)=>!index||damage<damages[index-1]));
});

test('charge and cooldown keep the same one-hit cadence across frame rates, long frames and x1/x3',()=>{
  for(const dt of [1/320,1/60,.1,.7])for(const speed of [1,3]) {
    const run=scene();run.world.gameSpeed=speed;
    const hits=[];run.world.eventBus.on('TOWER_HIT',event=>hits.push(event));advance(run.world,12,dt);
    const cycle=cfg().chargeDuration+cfg().beamDuration+cfg().cooldownDuration;
    const expected=Math.floor((12-cfg().chargeDuration)/cycle)+1;
    assert.equal(hits.length,expected,`dt=${dt} speed=${speed}`);assert.equal(run.fractal.shots,expected);
    assert.equal(run.health.current,run.health.max-expected*run.world.getComponent(run.boss,EnemyComponent).damage);
  }
});

test('pause freezes warning time; a queued or missing source cannot finish a charge',()=>{
  const run=scene();advance(run.world,.3);const before={shots:run.fractal.shots,time:run.fractal.phaseRemaining,elapsed:run.fractal.elapsed};
  run.world.isPaused=true;advance(run.world,2);
  assert.equal(run.fractal.shots,before.shots);assert.equal(run.fractal.phaseRemaining,before.time);assert.equal(run.fractal.elapsed,before.elapsed);
  run.world.isPaused=false;run.world.destroyEntity(run.boss);run.ai.update(run.world,20);assert.equal(run.fractal.shots,0);
  const targetless=scene();targetless.world.destroyEntity(targetless.tower);targetless.world._flushDestructionQueue();
  targetless.ai.update(targetless.world,20);assert.equal(targetless.fractal.shots,0);
});

test('large branches split exactly once into three fragments, which split once into nine terminal shards',()=>{
  const run=scene(),part=run.fractal.branches[0];kill(run,part.id);
  const fragments=ofType(run.world,'fractal_fragment');assert.equal(fragments.length,3);
  kill(run,part.id);assert.equal(ofType(run.world,'fractal_fragment').length,3,'duplicate death cannot clone children');
  for(const id of fragments)kill(run,id);
  const shards=ofType(run.world,'fractal_shard');assert.equal(shards.length,9);
  for(const id of shards)kill(run,id);
  assert.equal(ofType(run.world,'fractal_fragment').length,0);assert.equal(ofType(run.world,'fractal_shard').length,0);
  assert.equal(ofType(run.world,'fractal_branch').length,3);
  assert.ok(run.bossHp.current>0);
});

test('all split generations use stage scaling and finite, non-regenerating health pools',()=>{
  const run=scene(),part=run.fractal.branches[0];kill(run,part.id);
  const multiplier=1.1**19*1.25**5;
  for(const id of ofType(run.world,'fractal_fragment')) {
    assert.equal(run.world.getComponent(id,HealthComponent).max,Math.round(GameConfig.enemies.fractal_fragment.baseHp*multiplier));
    assert.equal(run.world.getComponent(id,HealthComponent).regenRate,0);kill(run,id);
  }
  for(const id of ofType(run.world,'fractal_shard'))assert.equal(run.world.getComponent(id,HealthComponent).max,Math.round(GameConfig.enemies.fractal_shard.baseHp*multiplier));
});

test('split progress reconciles live targets once after the death decrement, with exact born totals',()=>{
  const run=scene();run.waves.totalEnemiesInWave=run.waves.enemiesSpawned=5;
  let displayed=5;const updates=[];
  run.world.eventBus.on('ENTITY_DIED',event=>{if(event.isEnemy)displayed=Math.max(0,displayed-1);});
  run.world.eventBus.on('WAVE_PROGRESS',event=>{updates.push(event);displayed=event.total-event.spawned+event.alive;});
  kill(run,run.fractal.branches[0].id);run.world.update(.01);
  assert.equal(updates.length,1);assert.equal(updates[0].total,8);assert.equal(updates[0].spawned,8);
  assert.equal(updates[0].alive,7);assert.equal(displayed,run.world.getEntitiesWith(EnemyComponent).length);
  kill(run,ofType(run.world,'fractal_fragment')[0]);run.world.update(.01);
  assert.equal(updates.length,2);assert.equal(updates[1].total,11);assert.equal(updates[1].spawned,11);
  assert.equal(updates[1].alive,9);assert.equal(displayed,run.world.getEntitiesWith(EnemyComponent).length);
  run.world.update(.01);assert.equal(updates.length,2,'unchanged target counts do not publish redundant reconciliation');
});

test('core death detaches surviving branches without healing and recycled core IDs cannot recapture them',()=>{
  const run=scene(),parts=[...run.fractal.branches];parts[0].health.current-=3;
  const remaining=parts.map(part=>part.health.current);kill(run,run.boss);run.world._flushDestructionQueue();
  const recycled=run.world.createEntity();assert.equal(recycled,run.boss);
  run.world.addComponent(recycled,new HealthComponent(100,100));run.world.addComponent(recycled,new FractalComponent());
  advance(run.world,.01);
  parts.forEach((part,index)=>{assert.equal(part.health.current,remaining[index]);assert.equal(run.world.getComponent(part.id,FractalBranchComponent).attached,false);});
  assert.equal(ofType(run.world,'fractal_branch').length,4);assert.equal(run.fractal.shots,0);
});

test('direct parent removal releases orphans without fabricated deaths, splits or restored health',()=>{
  const run=scene(),parts=[...run.fractal.branches];let deaths=0;
  run.world.eventBus.on('ENTITY_DIED',()=>deaths++);parts[0].health.current-=3;
  const hp=parts.map(part=>part.health.current);run.world.destroyEntity(run.boss);run.world._flushDestructionQueue();
  const recycled=run.world.createEntity();assert.equal(recycled,run.boss);run.world.addComponent(recycled,new HealthComponent(100,100));
  advance(run.world,.01);
  parts.forEach((part,index)=>{assert.equal(part.health.current,hp[index]);assert.equal(run.world.getComponent(part.id,FractalBranchComponent).attached,false);});
  assert.equal(ofType(run.world,'fractal_fragment').length,0);assert.equal(deaths,0);
});

test('attached branches cause no contact damage; detached branches and terminal shards can attack on contact',()=>{
  const run=scene(),part=run.fractal.branches[0],point=run.world.getComponent(part.id,TransformComponent);
  point.x=600;point.y=400;let contacts=0;run.world.eventBus.on('TOWER_CONTACT',()=>contacts++);
  new CollisionSystem().update(run.world,.01);assert.equal(contacts,0);
  run.damages._applyDamageToEntity(run.world,part.id,Math.ceil(part.health.max/2),false);
  point.x=600;point.y=400;new CollisionSystem().update(run.world,.01);assert.equal(contacts,1);
  const before=run.health.current;assert.ok(before<run.health.max);
  kill(run,part.id);for(const id of ofType(run.world,'fractal_fragment'))kill(run,id);
  const shard=ofType(run.world,'fractal_shard')[0],shardPoint=run.world.getComponent(shard,TransformComponent);
  shardPoint.x=600;shardPoint.y=400;new CollisionSystem().update(run.world,.01);assert.ok(run.health.current<before);
});

test('death disconnects homing immediately and stale branch slots never attach a recycled projectile',()=>{
  const run=scene(),part=run.fractal.branches[0],bullet=run.world.createEntity();
  const projectile=new ProjectileComponent(run.tower,part.id,0,3,100);run.world.addComponent(bullet,projectile);
  kill(run,part.id);assert.equal(projectile.targetEntityId,null);run.world._flushDestructionQueue();
  const recycled=run.world.createEntity();assert.equal(recycled,part.id);
  const position=new TransformComponent(20,20);for(const component of [position,new HealthComponent(100,100),new ProjectileComponent()])run.world.addComponent(recycled,component);
  advance(run.world,.02);assert.equal(position.x,20);assert.equal(position.y,20);
  assert.equal(getLiveFractalBranchCount(run.world,run.fractal),3);
});

test('beam applies tower armor once and reflected damage can kill the source without another hit in a long frame',()=>{
  const run=scene(),armor=run.world.getComponent(run.tower,ArmorComponent);armor.flatReduction=10;armor.percentReduction=.5;
  run.ai.update(run.world,cfg().chargeDuration+.001);
  assert.equal(run.health.current,run.health.max-Math.round((run.world.getComponent(run.boss,EnemyComponent).damage-10)*.5));
  const reflected=scene();reflected.bossHp.current=1;reflected.world.getComponent(reflected.tower,DefenseComponent).damageReflection=1;
  let hits=0;reflected.world.eventBus.on('TOWER_HIT',()=>hits++);reflected.ai.update(reflected.world,20);
  assert.equal(hits,1);assert.equal(reflected.fractal.shots,1);assert.equal(reflected.bossHp.current,0);
});

test('normal automatic targeting can finish every branch generation and core at base and long range',()=>{
  for(const range of [130,450,1750])for(const speed of [1,3]) {
    const run=scene({fire:true,range});run.world.gameSpeed=speed;
    const deaths=[];run.world.eventBus.on('ENTITY_DIED',event=>deaths.push(event.enemyType));advance(run.world,100);
    assert.equal(ofType(run.world,'boss_fractal').length,0,`range=${range} speed=${speed}`);
    assert.equal(run.world.getEntitiesWith(EnemyComponent).length,0,`remaining descendants at range=${range} speed=${speed}`);
    assert.equal(deaths.filter(type=>type==='fractal_branch').length,4);
    assert.equal(deaths.filter(type=>type==='fractal_fragment').length,12);
    assert.equal(deaths.filter(type=>type==='fractal_shard').length,36);
    assert.ok(run.health.current>0);
  }
});

test('homing arrives at a stationary radius-seven shard instead of oscillating past it at x3',()=>{
  for(const {dt,speed,distance} of [
    {dt:1/60,speed:3,distance:13.75},
    {dt:.1,speed:1,distance:27.5},
    {dt:.1,speed:3,distance:82.5},
    {dt:1/60,speed:3,distance:0}
  ]) {
    const world=new World();world.gameSpeed=speed;
    const tower=world.createEntity(),target=world.createEntity(),bullet=world.createEntity();
    for(const component of [new TowerComponent(),new TransformComponent(600,400),new CircleColliderComponent(26,1000,true)])world.addComponent(tower,component);
    const health=new HealthComponent(10,10);
    // No VelocityComponent: the target stays fixed while the projectile crosses its center.
    for(const component of [new EnemyComponent('fractal_shard'),new TransformComponent(800,400),new CircleColliderComponent(7,.5),health])world.addComponent(target,component);
    const velocity=new VelocityComponent(550,0,550,550),position=new TransformComponent(800-distance,400);
    for(const component of [new ProjectileComponent(tower,target,0,2.5,25),position,velocity,new CircleColliderComponent(4,.1)])world.addComponent(bullet,component);
    for(const system of [new MovementSystem(),new CollisionSystem(),new DamageSystem()])world.registerSystem(system);
    let deaths=0;world.eventBus.on('ENTITY_DIED',event=>{if(event.entityId===target)deaths++;});
    world.update(dt);
    assert.equal(health.current,0,`dt=${dt}, x${speed}, distance=${distance}`);
    assert.ok(Math.abs(position.x-800)<1e-7);assert.equal(position.y,400);
    assert.equal(velocity.currentSpeed,550,'arriving this frame does not alter configured flight speed');
    assert.equal(world.getEntitiesWith(ProjectileComponent).length,0);assert.equal(deaths,1);
    world.update(dt);assert.equal(deaths,1);
  }
});

test('victory waits for the final descendant, pays once and unlocks level seven',()=>{
  const run=scene(),economy=new EconomyComponent();economy.crystalDropChance=0;
  run.world.addComponent(run.tower,economy);run.world.stageId=6;
  run.waves.state='ACTIVE';run.waves.totalEnemiesInWave=run.waves.enemiesSpawned=5;run.world.registerSystem(new EconomySystem());
  const values=new Map(),storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
  const progress=new PlayerProgress(storage);progress.init(run.world);for(let stage=1;stage<=5;stage++)progress.credit(0,stage);
  let wins=0,payments=0;run.world.eventBus.on('STAGE_COMPLETED',()=>wins++);run.world.eventBus.on('RUN_CRYSTALS_SETTLED',()=>payments++);
  kill(run,run.boss);run.world.update(.01);assert.equal(wins,0);assert.equal(payments,0);
  for(const type of ['fractal_branch','fractal_fragment'])for(const id of ofType(run.world,type))kill(run,id);
  const shards=ofType(run.world,'fractal_shard');assert.equal(shards.length,36);
  for(const id of shards.slice(1))kill(run,id);run.world.update(.01);assert.equal(wins,0);assert.equal(payments,0);
  kill(run,shards[0]);run.world.update(.01);
  assert.equal(run.world.runOutcome,'victory');assert.equal(progress.completedStages,6);assert.equal(progress.isStageUnlocked(7),true);
  assert.equal(wins,1);assert.equal(payments,1);assert.equal(progress.crystals,21);
  run.waves._completeWave(run.world);run.world.eventBus.emit('STAGE_COMPLETED',{stage:6});assert.equal(payments,1);assert.equal(progress.crystals,21);
});

function paintContext() {
  const calls=[],stack=[],ctx={calls,globalAlpha:1,shadowBlur:0,
    save(){stack.push({globalAlpha:this.globalAlpha,shadowBlur:this.shadowBlur});},
    restore(){Object.assign(this,stack.pop());},
    drawImage(...args){calls.push(['image',...args]);},
    stroke(){calls.push(['stroke',this.shadowBlur]);}};
  return new Proxy(ctx,{get:(object,key)=>object[key]??((...args)=>calls.push([key,...args])),
    set(object,key,value){if(key==='shadowBlur'&&value>0)calls.push(['blur']);object[key]=value;return true;}});
}

test('self-similar hull and fragment artwork reuse fixed cached states with no live glow or geometry',()=>{
  const canvases=[],output=paintContext(),cache=new EnemyVisualCache(()=>{const canvas={getContext:()=>paintContext()};canvases.push(canvas);return canvas;});
  const painter={_drawEnemyBody(ctx,type,render,glow,_core,phase){
    if(type==='boss_fractal')drawFractalCore(ctx,render,glow,phase);else drawFractalBranch(ctx,render,glow,phase);
  }};
  const draw=()=>{
    for(const type of ['boss_fractal','fractal_branch','fractal_fragment','fractal_shard']) {
      const phases=type==='boss_fractal'||type==='fractal_branch'?['idle','charge','firing']:['small'];
      for(const phase of phases)cache.draw(output,painter,type,GameConfig.enemies[type],.75,1,phase);
    }
  };
  draw();const count=canvases.length;output.calls.length=0;for(let frame=0;frame<240;frame++)draw();
  assert.equal(canvases.length,count);assert.ok(count<=16);
  assert.equal(output.calls.some(call=>['blur','stroke','fill','beginPath','createLinearGradient','createRadialGradient'].includes(call[0])),false);
  assert.ok(canvases.reduce((sum,canvas)=>sum+canvas.width*canvas.height*4,0)<2*1024*1024);
});

test('all discharge progress values and seeds select one bounded baked atlas and one blit per flash',()=>{
  const canvases=[],output=paintContext(),visual=new FractalDischargeVisual(()=>{const canvas={getContext:()=>paintContext()};canvases.push(canvas);return canvas;});
  visual.draw(output,0,0,100,0,1,0);assert.equal(canvases.length,1);output.calls.length=0;
  for(let frame=0;frame<400;frame++)visual.draw(output,10,20,100+frame,80,.001+(frame%100)/101,frame-200);
  assert.equal(canvases.length,1);assert.equal(output.calls.filter(call=>call[0]==='image').length,400);
  assert.equal(output.calls.some(call=>['blur','stroke','fill','beginPath','createLinearGradient','createRadialGradient'].includes(call[0])),false);
  assert.ok(canvases[0].width*canvases[0].height*4<=1.5*1024*1024);
  output.calls.length=0;visual.draw(output,0,0,100,0,0);visual.draw(output,0,0,0,0,1);
  assert.equal(output.calls.length,0);
});

test('integrated processor health uses at most two unblurred strokes at each recursive size',()=>{
  for(const radius of [25,27,12,7])for(const hp of [100,50,1,0])for(const isBranch of [false,true]) {
    const ctx=paintContext();drawFractalHealth(ctx,{radius},{current:hp,max:100},isBranch);
    const strokes=ctx.calls.filter(call=>call[0]==='stroke');assert.ok(strokes.length>=1&&strokes.length<=2);
    assert.ok(strokes.every(call=>call[1]===0));
    assert.equal(ctx.calls.some(call=>['image','blur','createRadialGradient','createLinearGradient'].includes(call[0])),false);
  }
});

test('charge travels inward through four branches using two tiny shared textures, without per-frame paths',()=>{
  const canvases=[],output=paintContext(),visual=new FractalChargeVisual(()=>{const canvas={getContext:()=>paintContext()};canvases.push(canvas);return canvas;});
  const points=Array.from({length:7},(_,slot)=>({x:Math.cos(slot*Math.PI/2)*50,y:Math.sin(slot*Math.PI/2)*50}));
  visual.drawLink(output,0,0,50,20);visual.draw(output,0,0,points,.5);
  assert.equal(canvases.length,2);output.calls.length=0;
  for(let frame=0;frame<240;frame++) {
    visual.draw(output,0,0,points,(frame%100)/99);
    visual.drawLink(output,0,0,50,20,frame%2===0);
  }
  assert.equal(canvases.length,2);
  assert.ok(output.calls.filter(call=>call[0]==='image').length<=13*240);
  assert.equal(output.calls.some(call=>['blur','stroke','fill','beginPath','createLinearGradient','createRadialGradient'].includes(call[0])),false);
  assert.equal(canvases.reduce((sum,canvas)=>sum+canvas.width*canvas.height*4,0),25*1024);
  const empty=new FractalChargeVisual(()=>{throw Error('empty charge must not allocate');});
  empty.draw(output,0,0,[],.5);empty.drawLink(output,1,1,1,1);
});
