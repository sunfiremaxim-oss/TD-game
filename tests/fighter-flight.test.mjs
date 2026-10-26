import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/core/World.js';
import { MovementSystem } from '../src/systems/MovementSystem.js';
import { PhysicsSeparationSystem } from '../src/systems/PhysicsSeparationSystem.js';
import { CollisionSystem } from '../src/systems/CollisionSystem.js';
import { WaveSystem } from '../src/systems/WaveSystem.js';
import { TransformComponent } from '../src/components/TransformComponent.js';
import { VelocityComponent } from '../src/components/VelocityComponent.js';
import { EnemyComponent } from '../src/components/EnemyComponent.js';
import { FighterFlightComponent } from '../src/components/FighterFlightComponent.js';
import { TowerComponent } from '../src/components/TowerComponent.js';
import { CircleColliderComponent } from '../src/components/CircleColliderComponent.js';
import { HealthComponent } from '../src/components/HealthComponent.js';
import { GameConfig } from '../src/config/GameConfig.js';
import { AttackComponent } from '../src/components/AttackComponent.js';

function entity(world, ...components) {
  const id = world.createEntity();
  for (const component of components) world.addComponent(id, component);
  return id;
}
function setup() {
  const world = new World();
  entity(world, new TowerComponent(), new TransformComponent(0, 0), new CircleColliderComponent(26, 1000, true), new HealthComponent(300, 300));
  const movement = new MovementSystem(), physics = new PhysicsSeparationSystem();
  return { world, movement, physics };
}
function fighter(world, x = 400, y = 0, direction = 1, spiral = 3.0) {
  return entity(world, new EnemyComponent('fighter'), new FighterFlightComponent(direction, spiral),
    new TransformComponent(x, y), new CircleColliderComponent(11), new VelocityComponent(0, 0, 108.5, 108.5), new HealthComponent(100, 100));
}
function ally(world, x, y, speed = 0, radius = 22) {
  return entity(world, new EnemyComponent('tank'), new TransformComponent(x, y),
    new CircleColliderComponent(radius, 8), new VelocityComponent(0, 0, speed, speed), new HealthComponent(1000, 1000));
}

for (const dt of [1 / 120, 1 / 30, 0.1]) {
  test(`both spiral directions shrink to actual melee contact without changing speed (${dt}s step)`, () => {
    const paths = [];
    for (const direction of [-1, 1]) {
      const { world, movement, physics } = setup();
      const id = fighter(world, 400, 0, direction), transform = world.getComponent(id, TransformComponent);
      let previousDistance = 400, angularTravel = 0, previousAngle = 0, contact = 0;
      const collision = new CollisionSystem();
      world.eventBus.on('TOWER_CONTACT', () => contact++);
      for (let time = 0; time < 15; time += dt) {
        movement.update(world, dt); physics.update(world, dt); collision.update(world, dt);
        const distance = Math.hypot(transform.x, transform.y), angle = Math.atan2(transform.y, transform.x);
        angularTravel += Math.atan2(Math.sin(angle - previousAngle), Math.cos(angle - previousAngle));
        previousAngle = angle;
        assert.ok(distance <= previousDistance + 0.001, `radius increased: ${distance} > ${previousDistance}`);
        previousDistance = distance;
        const v = world.getComponent(id, VelocityComponent);
        assert.ok(Math.hypot(v.vx, v.vy) <= 108.5 + 0.00001);
      }
      assert.ok(previousDistance <= 37.01, `never reached core: ${previousDistance}`);
      assert.ok(Math.abs(angularTravel) > 5.2, `not a full spiral: ${angularTravel}`);
      assert.ok(contact > 0, 'fighter must actually attack the tower');
      // Body collision remains functional; no separate movement damage mechanism.
      paths.push({ x: transform.x, y: transform.y, angularTravel });
    }
    assert.ok(Math.abs(paths[0].x - paths[1].x) < 0.001);
    assert.ok(Math.abs(paths[0].y + paths[1].y) < 0.001);
  });
}

test('fighters bypass a blocking ally on its tower-facing opposite side without physical pushes, then reach core', () => {
  for (const direction of [-1, 1]) {
    const { world, movement, physics } = setup();
    const id = fighter(world, 400, 0, direction);
    const blocker = ally(world, 195, -228 * direction);
    const position = world.getComponent(id, TransformComponent), obstacle = world.getComponent(blocker, TransformComponent);
    let minClearance = Infinity, rearAtClosest = 0, maxPush = 0, avoided = false;
    for (let time = 0; time < 18; time += 1 / 60) {
      movement.update(world, 1 / 60);
      avoided ||= world.getComponent(id, FighterFlightComponent).obstacle !== null;
      const clearance = Math.hypot(position.x - obstacle.x, position.y - obstacle.y);
      if (clearance < minClearance) {
        minClearance = clearance;
        rearAtClosest = (position.x - obstacle.x) * obstacle.x + (position.y - obstacle.y) * obstacle.y;
      }
      const x = position.x, y = position.y;
      physics.update(world, 1 / 60);
      maxPush = Math.max(maxPush, Math.hypot(position.x - x, position.y - y));
    }
    assert.ok(minClearance >= 33, `collided: ${minClearance}`);
    assert.ok(avoided, 'blocker must actually require an avoidance manoeuvre');
    assert.ok(rearAtClosest > 0, `passed in front of ally: ${rearAtClosest}`);
    assert.ok(maxPush < 0.001, `relied on separation: ${maxPush}`);
    assert.ok(Math.hypot(position.x, position.y) <= 37.01, `stuck: ${position.x}, ${position.y}`);
  }
});

test('spawn assigns both fixed directions and varying orbits once, not every update', () => {
  const { world, movement } = setup();
  const waves = new WaveSystem();
  let random = Math.random, seed = 742;
  Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  try { for (let i = 0; i < 30; i++) waves._spawnEnemy(world, 'fighter'); }
  finally { Math.random = random; }
  const flights = world.getEntitiesWith(FighterFlightComponent).map(id => world.getComponent(id, FighterFlightComponent));
  assert.equal(new Set(flights.map(f => f.direction)).size, 2);
  assert.ok(new Set(flights.map(f => f.spiralRatio)).size > 20);
  for (const f of flights) assert.ok(f.spiralRatio >= GameConfig.enemies.fighter.flight.spiralMin && f.spiralRatio <= GameConfig.enemies.fighter.flight.spiralMax);
  Math.random = () => { throw Error('Flight must not reroll or consume weapon chance rolls'); };
  try { movement.update(world, 1 / 60); movement.update(world, 1 / 60); }
  finally { Math.random = random; }
});

test('moving allies are anticipated at normal and x3-sized steps without pushing either body', () => {
  for (const dt of [1 / 60, 0.05]) for (const direction of [-1, 1]) {
    const { world, movement, physics } = setup();
    const id = fighter(world, 400, 0, direction), blocker = ally(world, 260, -310 * direction, 36.4);
    world.getComponent(blocker, EnemyComponent).type = 'aegis';
    const p = world.getComponent(id, TransformComponent), b = world.getComponent(blocker, TransformComponent);
    let minClearance = Infinity, maxPush = 0, avoided = false;
    for (let time = 0; time < 9; time += dt) {
      movement.update(world, dt);
      avoided ||= world.getComponent(id, FighterFlightComponent).obstacle !== null;
      if (Math.hypot(p.x, p.y) > 75 && Math.hypot(b.x, b.y) > 75) {
        minClearance = Math.min(minClearance, Math.hypot(p.x - b.x, p.y - b.y));
        const px = p.x, py = p.y, bx = b.x, by = b.y;
        physics.update(world, dt);
        maxPush = Math.max(maxPush, Math.hypot(p.x - px, p.y - py), Math.hypot(b.x - bx, b.y - by));
      } else physics.update(world, dt);
    }
    assert.ok(minClearance >= 33, `moving collision: ${minClearance}`);
    assert.ok(avoided, 'moving ally must actually cross the preferred course');
    assert.ok(maxPush < 0.001, `moving-body push: ${maxPush}`);
  }
});

function convoySetup(range = 130) {
  const scene = setup();
  const tower = scene.world.getEntitiesWith(TowerComponent)[0];
  scene.world.addComponent(tower, new AttackComponent(25, 1.6, range));
  const tank = ally(scene.world, 340, 0, 36.4);
  const id = fighter(scene.world, 400, 0);
  return { ...scene, tower, tank, id, flight: scene.world.getComponent(id, FighterFlightComponent) };
}
function tick(scene, dt = 1 / 60) { scene.movement.update(scene.world, dt); scene.physics.update(scene.world, dt); }

test('tank seeking has its own 350px radius and retains a distant target beyond the old detach limit', () => {
  const range = GameConfig.enemies.fighter.escort.seekDistance;
  assert.ok(GameConfig.enemies.fighter.escort.detachDistance > range);
  for (const distance of [range - 1, range, range + 1]) {
    const scene = setup(), { world } = scene;
    const tank = ally(world, 300, 0, 36.4), id = fighter(world, 300 + distance, 0);
    tick(scene);
    const flight = world.getComponent(id, FighterFlightComponent);
    if (distance > range) {
      assert.equal(flight.mode, 'spiral');
      assert.equal(flight.escortTankId, null);
    } else {
      assert.equal(flight.mode, 'joining');
      assert.equal(flight.escortTankId, tank);
      for (let i = 0; i < 30; i++) {
        tick(scene);
        assert.equal(flight.escortTankId, tank, 'must not repeatedly drop a newly found distant tank');
      }
    }
  }
});

test('seeking chooses the nearest valid tank in any direction and keeps that leader when a closer one appears', () => {
  const scene = setup(), { world } = scene;
  const id = fighter(world, 650, 0), nearest = ally(world, 400, 100, 36.4);
  ally(world, 350, -100, 36.4);
  world.getComponent(ally(world, 550, 0, 36.4), HealthComponent).current = 0;
  world.destroyEntity(ally(world, 600, 0, 36.4));
  world.getComponent(ally(world, 580, 0, 36.4), EnemyComponent).knockbackRemaining = 1;
  ally(world, 560, 0, 0);
  tick(scene);
  const flight = world.getComponent(id, FighterFlightComponent);
  assert.equal(flight.escortTankId, nearest);
  ally(world, 610, 80, 36.4); tick(scene);
  assert.equal(flight.escortTankId, nearest);
  world.getComponent(nearest, HealthComponent).current = 0;
  tick(scene);
  assert.notEqual(flight.escortTankId, nearest);
  assert.equal(flight.mode, 'joining', 'should seek another valid tank when the leader dies');
});

test('a tank behind the fighter can be actively sought without waiting for the spiral to intersect it', () => {
  const scene = setup(), { world } = scene;
  const tank = ally(world, 500, 0, 36.4), id = fighter(world, 250, 0);
  tick(scene);
  const flight = world.getComponent(id, FighterFlightComponent);
  assert.equal(flight.escortTankId, tank);
  assert.ok(world.getComponent(id, VelocityComponent).vx > 0, 'fighter should turn away from the core to join cover');
  let escorted = false, rushed = false;
  for (let i = 0; i < 1200; i++) {
    tick(scene);
    escorted ||= flight.mode === 'escort';
    rushed ||= flight.mode === 'charge';
  }
  assert.ok(escorted && rushed);
  const p = world.getComponent(id, TransformComponent);
  assert.ok(Math.hypot(p.x, p.y) <= 40.1);
});

for (const dt of [1 / 120, 1 / 30, 0.05, 0.15]) {
  test(`fighter settles behind tank at its speed, releases halfway through attack range and charges (${dt}s)`, () => {
    const scene = convoySetup(), { world, id, tank, flight } = scene;
    const p = world.getComponent(id, TransformComponent), t = world.getComponent(tank, TransformComponent);
    const v = world.getComponent(id, VelocityComponent), config = GameConfig.enemies.fighter.escort;
    const release = 26 + (130 - 26) * (1 - config.releaseDepth);
    const modes = new Set(); let escortSamples = 0, minGap = Infinity, maxSpeed = 0, charged = false;
    for (let time = 0; time < 14; time += dt) {
      const before = flight.mode;
      const tankBefore = t.x;
      tick(scene, dt); modes.add(flight.mode);
      minGap = Math.min(minGap, Math.hypot(p.x - t.x, p.y - t.y));
      maxSpeed = Math.max(maxSpeed, Math.hypot(v.vx, v.vy));
      if (flight.mode === 'escort') {
        assert.ok(t.x > release - 36.4 * dt - 0.001, 'released too late');
        assert.ok(p.x > t.x && Math.abs(p.y - t.y) < 0.001, 'fighter must remain behind tank');
        if (time > 1) { assert.ok(Math.abs(Math.hypot(v.vx, v.vy) - 36.4) < 1); escortSamples++; }
      }
      if (before !== 'breakout' && flight.mode === 'breakout') {
        assert.ok(tankBefore <= release && tankBefore >= release - 36.4 * dt - 0.001, `wrong launch point: ${tankBefore}`);
      }
      if (charged) assert.equal(flight.mode, 'charge', 'one-way rush must not attach to another tank');
      charged ||= flight.mode === 'charge';
    }
    assert.deepEqual([...modes], ['joining', 'escort', 'breakout', 'charge']);
    assert.ok(escortSamples > 20);
    assert.ok(minGap >= 33 - 0.001, `fighter cut through tank: ${minGap}`);
    assert.ok(maxSpeed > 108.5 * 1.5 && maxSpeed <= 108.5 * config.chargeMultiplier + 0.001);
    assert.ok(Math.hypot(p.x, p.y) <= 37.01, 'rush must end in melee contact');
    assert.equal(v.currentSpeed, 108.5, 'tactics must not change the underlying speed stat');
    assert.equal(world.getComponent(id, HealthComponent).current, 100, 'escort grants no extra health or immunity');
  });
}

test('escort stops on tank death or removal, and recycled IDs cannot transfer the formation', () => {
  for (const removed of [false, true]) {
    const scene = convoySetup(), { world, id, tank, flight } = scene;
    for (let i = 0; i < 100; i++) tick(scene);
    assert.equal(flight.mode, 'escort');
    const oldTank = flight.escortTank;
    if (removed) {
      world.destroyEntity(tank); world._flushDestructionQueue();
      assert.equal(ally(world, -800, 800, 36.4), tank);
    } else world.getComponent(tank, HealthComponent).current = 0;
    tick(scene);
    assert.equal(flight.mode, 'spiral');
    assert.equal(flight.escortTank, null);
    assert.equal(flight.escortTankId, null);
    assert.notEqual(world.getComponent(tank, EnemyComponent), removed ? oldTank : null);
    const v = world.getComponent(id, VelocityComponent);
    assert.ok(Math.hypot(v.vx, v.vy) <= v.currentSpeed + 0.001);
  }
});

test('a fighter seeks a distant tank from the side, escorts it and completes the rush', () => {
  for (const direction of [-1, 1]) {
    const scene = setup(), { world } = scene;
    const tower = world.getEntitiesWith(TowerComponent)[0];
    world.addComponent(tower, new AttackComponent(25, 1.6, 130));
    const tank = ally(world, 260, -310 * direction, 36.4);
    const id = fighter(world, 400, 0, direction), flight = world.getComponent(id, FighterFlightComponent);
    const modes = new Set(); let joinedAt = null, launchedAt = null;
    for (let i = 0; i < 1200; i++) {
      tick(scene); modes.add(flight.mode);
      if (i === 0) {
        assert.equal(flight.escortTankId, tank, 'tank ~340px away must be found before a local encounter');
        assert.equal(flight.mode, 'joining');
      }
      if (flight.mode === 'escort' && joinedAt === null) joinedAt = i / 60;
      if (flight.mode === 'breakout' && launchedAt === null) launchedAt = i / 60;
      if (flight.mode === 'escort') {
        const p = world.getComponent(id, TransformComponent), t = world.getComponent(tank, TransformComponent);
        assert.ok((p.x - t.x) * t.x + (p.y - t.y) * t.y > 0, 'join must finish behind the tank');
      }
    }
    assert.ok(['joining', 'escort', 'breakout', 'charge'].every(mode => modes.has(mode)));
    assert.ok(launchedAt - joinedAt > 0.5, 'must actually travel together before launching');
    const p = world.getComponent(id, TransformComponent);
    assert.ok(Math.hypot(p.x, p.y) <= 40.1);
  }
});

test('fighters reserve separate rear slots and do not teleport or stack into one formation point', () => {
  const scene = setup(), { world, movement } = scene;
  const tank = ally(world, 340, 0, 36.4);
  const ids = [fighter(world, 400, 0), fighter(world, 425, 0), fighter(world, 450, 0), fighter(world, 400, 30)];
  movement.update(world, 1 / 60);
  const assigned = ids.map(id => world.getComponent(id, FighterFlightComponent));
  assert.deepEqual(assigned.map(f => f.escortSlot), [0, 1, 2, 3]);
  assert.ok(assigned.every(f => f.escortTankId === tank));
  for (const [index, id] of ids.entries()) {
    const p = world.getComponent(id, TransformComponent);
    const startX = index < 3 ? 400 + index * 25 : 400, startY = index < 3 ? 0 : 30;
    assert.ok(Math.hypot(p.x - startX, p.y - startY) <= 108.5 / 60 + 0.001);
  }
});

test('a group follows in separate positions and every fighter eventually completes its rush', () => {
  const scene = setup(), { world } = scene;
  const tower = world.getEntitiesWith(TowerComponent)[0];
  world.addComponent(tower, new AttackComponent(25, 1.6, 130));
  ally(world, 340, 0, 36.4);
  const ids = [fighter(world, 400, 0, 1), fighter(world, 425, 0, -1), fighter(world, 450, 0, 1)];
  const escorted = new Set(), rushed = new Set();
  for (let i = 0; i < 1200; i++) {
    tick(scene);
    for (const id of ids) {
      const flight = world.getComponent(id, FighterFlightComponent);
      if (flight.mode === 'escort') escorted.add(id);
      if (flight.mode === 'charge') rushed.add(id);
    }
  }
  assert.equal(escorted.size, ids.length);
  assert.equal(rushed.size, ids.length);
  for (const id of ids) {
    const p = world.getComponent(id, TransformComponent);
    assert.ok(Math.hypot(p.x, p.y) <= 40.1, `group member stuck away from core: ${p.x}, ${p.y}`);
  }
});

test('escort obeys game speed and detaches when its tank is knocked away', () => {
  const a = convoySetup(), b = convoySetup();
  a.world.registerSystem(a.movement); b.world.registerSystem(b.movement); b.world.gameSpeed = 3;
  for (let i = 0; i < 150; i++) { a.world.update(0.05); b.world.update(0.05 / 3); }
  assert.deepEqual(a.world.getComponent(a.id, TransformComponent), b.world.getComponent(b.id, TransformComponent));
  assert.equal(a.flight.mode, b.flight.mode);
  const scene = convoySetup();
  for (let i = 0; i < 100; i++) tick(scene);
  Object.assign(scene.world.getComponent(scene.tank, EnemyComponent), { knockbackRemaining: 0.3, knockbackVx: 100, knockbackVy: 0 });
  tick(scene);
  assert.equal(scene.flight.mode, 'spiral');
  assert.equal(scene.flight.escortTank, null);
});

test('current attack range controls the release point, while a tank already deep inside cannot grant a fresh charge', () => {
  const scene = convoySetup(), { world, tank, flight, tower } = scene;
  for (let i = 0; i < 100; i++) tick(scene);
  assert.equal(flight.mode, 'escort');
  const t = world.getComponent(tank, TransformComponent);
  world.getComponent(tower, AttackComponent).range = 600;
  tick(scene);
  assert.ok(t.x < (600 + 26) / 2);
  assert.equal(flight.mode, 'breakout');
  const other = setup();
  ally(other.world, 65, 0, 36.4);
  const fresh = fighter(other.world, 115, 0);
  tick(other);
  assert.equal(other.world.getComponent(fresh, FighterFlightComponent).mode, 'spiral');
});

test('knockback and pause take priority over escort and acceleration; tank death after launch does not cancel the rush', () => {
  const scene = convoySetup(), { world, id, tank, flight } = scene;
  for (let i = 0; i < 100; i++) tick(scene);
  const enemy = world.getComponent(id, EnemyComponent), p = world.getComponent(id, TransformComponent);
  const x = p.x;
  Object.assign(enemy, { knockbackRemaining: 0.1, knockbackVx: 120, knockbackVy: 0 });
  tick(scene, 0.1);
  assert.ok(Math.abs(p.x - x - 12) < 0.001);
  assert.equal(flight.chargeElapsed, 0);
  for (let i = 0; i < 600 && flight.mode !== 'breakout'; i++) tick(scene);
  assert.equal(flight.mode, 'breakout');
  world.destroyEntity(tank); tick(scene);
  assert.equal(flight.mode, 'charge');
  const frozen = JSON.stringify([p, flight]);
  world.registerSystem(scene.movement); world.isPaused = true; world.update(1);
  assert.equal(JSON.stringify([p, flight]), frozen);
});

test('dead and queued allies do not affect flight, and a recycled ID cannot retain an avoidance lock', () => {
  const { world, movement } = setup();
  const id = fighter(world), blocker = ally(world, 195, -228);
  for (let i = 0; i < 200 && !world.getComponent(id, FighterFlightComponent).obstacle; i++) movement.update(world, 1 / 60);
  const flight = world.getComponent(id, FighterFlightComponent);
  assert.ok(flight.obstacle, 'set up an actual active avoidance lock');
  const oldEnemy = world.getComponent(blocker, EnemyComponent);
  world.destroyEntity(blocker); world._flushDestructionQueue();
  const replacement = ally(world, -900, 900);
  assert.equal(replacement, blocker);
  movement.update(world, 1 / 60);
  assert.notEqual(flight.obstacle, oldEnemy);
  world.getComponent(replacement, HealthComponent).current = 0;
  movement.update(world, 1 / 60);
  assert.equal(movement.fighterSteering.bodyCount, 1);
  world.destroyEntity(id); world._flushDestructionQueue();
  movement.update(world, 1 / 60);
  assert.equal(movement.fighterSteering.cells.size, 0);
  assert.ok(movement.fighterSteering.bodies.every(body => body.enemy === null));
});

test('scouts keep their original straight approach and never receive fighter flight state', () => {
  const { world, movement } = setup();
  const id = entity(world, new EnemyComponent('scout'), new TransformComponent(400, 0),
    new CircleColliderComponent(12), new VelocityComponent(0, 0, 73.5, 73.5), new HealthComponent(17, 17));
  movement.update(world, 0.5);
  assert.equal(world.getComponent(id, TransformComponent).x, 363.25);
  assert.equal(world.getComponent(id, TransformComponent).y, 0);
  assert.equal(world.hasComponent(id, FighterFlightComponent), false);
  new WaveSystem()._spawnEnemy(world, 'scout');
  assert.equal(world.getEntitiesWith(FighterFlightComponent).length, 0);
  assert.equal(GameConfig.enemies.scout.flight, undefined);
  assert.equal(movement.fighterSteering.cells.size, 0);
});

test('fighter body follows its flight direction, including the tangent and avoidance turn', () => {
  const { world, movement } = setup();
  const id = fighter(world); ally(world, 195, -228);
  for (let i = 0; i < 300; i++) {
    movement.update(world, 1 / 60);
    const v = world.getComponent(id, VelocityComponent), p = world.getComponent(id, TransformComponent);
    assert.ok(Math.abs(p.rotation - Math.atan2(v.vy, v.vx)) < 0.000001);
  }
});

test('both configured spiral extremes complete a pronounced orbit and reach the core', () => {
  for (const ratio of [GameConfig.enemies.fighter.flight.spiralMin, GameConfig.enemies.fighter.flight.spiralMax]) {
    const { world, movement, physics } = setup();
    const id = fighter(world, 400, 0, 1, ratio), p = world.getComponent(id, TransformComponent);
    let angle = 0, total = 0;
    for (let i = 0; i < 360; i++) {
      movement.update(world, 0.05); physics.update(world, 0.05);
      const next = Math.atan2(p.y, p.x);
      total += Math.atan2(Math.sin(next - angle), Math.cos(next - angle));
      angle = next;
    }
    assert.ok(Math.abs(total) > 4.8, `orbit too shallow at ratio ${ratio}: ${total}`);
    assert.ok(Math.hypot(p.x, p.y) <= 37.01, `failed to reach tower at ratio ${ratio}`);
  }
});

test('pause freezes fighter state and x3 advances exactly the same simulation time', () => {
  const a = setup(), b = setup();
  const idA = fighter(a.world), idB = fighter(b.world);
  a.world.registerSystem(a.movement); b.world.registerSystem(b.movement);
  b.world.gameSpeed = 3;
  for (let i = 0; i < 40; i++) { a.world.update(0.05); b.world.update(0.05 / 3); }
  assert.deepEqual(a.world.getComponent(idA, TransformComponent), b.world.getComponent(idB, TransformComponent));
  const before = JSON.stringify([a.world.getComponent(idA, TransformComponent), a.world.getComponent(idA, FighterFlightComponent)]);
  a.world.isPaused = true; a.world.update(2);
  assert.equal(JSON.stringify([a.world.getComponent(idA, TransformComponent), a.world.getComponent(idA, FighterFlightComponent)]), before);
});

test('knockback takes priority, then the same fighter resumes its spiral; other archetypes march straight', () => {
  const { world, movement } = setup();
  const id = fighter(world), enemy = world.getComponent(id, EnemyComponent), flight = world.getComponent(id, FighterFlightComponent);
  Object.assign(enemy, { knockbackRemaining: 0.2, knockbackVx: 120, knockbackVy: 0 });
  const other = ally(world, -400, 0, 36.4);
  movement.update(world, 0.1);
  assert.equal(world.getComponent(id, TransformComponent).x, 412);
  movement.update(world, 0.1);
  movement.update(world, 0.1);
  assert.equal(world.getComponent(id, FighterFlightComponent), flight);
  assert.ok(Math.abs(world.getComponent(id, VelocityComponent).vy) > 10);
  assert.equal(world.getComponent(other, TransformComponent).y, 0);
  assert.ok(world.getComponent(other, TransformComponent).x > -400);
});
