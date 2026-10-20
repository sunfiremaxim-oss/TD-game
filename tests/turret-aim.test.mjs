import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/core/World.js';
import { TowerComponent } from '../src/components/TowerComponent.js';
import { AttackComponent } from '../src/components/AttackComponent.js';
import { TargetComponent } from '../src/components/TargetComponent.js';
import { TransformComponent } from '../src/components/TransformComponent.js';
import { EnemyComponent } from '../src/components/EnemyComponent.js';
import { HealthComponent } from '../src/components/HealthComponent.js';
import { CircleColliderComponent } from '../src/components/CircleColliderComponent.js';
import { ProjectileComponent } from '../src/components/ProjectileComponent.js';
import { TargetingSystem } from '../src/systems/TargetingSystem.js';
import { WeaponSystem } from '../src/systems/WeaponSystem.js';
import { CollisionSystem } from '../src/systems/CollisionSystem.js';

function entity(world, ...components) {
  const id = world.createEntity();
  for (const component of components) world.addComponent(id, component);
  return id;
}
const error = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} differs from ${b}`);
function scene(angle = Math.PI) {
  const world = new World();
  const attack = new AttackComponent(25, 1.6, 200, 1, 0, 1.6, 2, 0, 0);
  const transform = new TransformComponent(600, 400, 0);
  const tower = entity(world, new TowerComponent(), attack, new TargetComponent(), transform);
  const targetPosition = new TransformComponent(600 + Math.cos(angle) * 80, 400 + Math.sin(angle) * 80);
  const target = entity(world, new EnemyComponent(), targetPosition, new HealthComponent(1e9, 1e9), new CircleColliderComponent(5));
  return { world, tower, target, targetPosition, attack, transform, targeting: new TargetingSystem() };
}

test('aim follows the shortest arc across the angle wrap instead of snapping', () => {
  const s = scene(10 * Math.PI / 180);
  s.transform.rotation = 350 * Math.PI / 180;
  s.targeting.update(s.world, 0.005);
  close(error(s.transform.rotation, 350 * Math.PI / 180), (72 / 7) * Math.PI / 180);
  assert.ok(Math.abs(error(s.transform.rotation, 10 * Math.PI / 180)) > 0.1);
});

test('a half turn scales with attack speed and rapid fire, including partial buff frames', () => {
  for (const [attackSpeed, rapidRemaining, stepTime, expectedAngle] of [
    [1.6, 0, 0.04375, Math.PI / 2],
    [10, 0, 0.007, Math.PI / 2],
    [1.6, 1, 7 / 240, Math.PI / 2],
    [1.6, 0.02, 0.03375, Math.PI / 2]
  ]) {
    const s = scene();
    s.attack.attackSpeed = attackSpeed;
    s.attack.rapidFireRemaining = rapidRemaining;
    s.targeting.update(s.world, stepTime);
    close(s.transform.rotation, expectedAngle);
  }
});

test('late target switches finish at the existing firing deadline without adding a delay', () => {
  const s = scene();
  s.attack.cooldown = 0.02;
  s.world.registerSystem(s.targeting);
  s.world.registerSystem(new WeaponSystem());
  const fired = [];
  s.world.eventBus.on('PROJECTILE_FIRED', event => fired.push({ ...event, angle: s.transform.rotation }));
  s.world.update(0.01);
  close(s.transform.rotation, Math.PI / 2);
  assert.equal(fired.length, 0);
  s.world.update(0.01);
  assert.equal(fired.length, 1);
  close(fired[0].angle, Math.PI);
  close(s.attack.cooldown, 1 / 1.6);
});

test('a target dying immediately before a shot cannot leave the barrel behind the replacement shot', () => {
  const s = scene(0);
  s.attack.cooldown = 0;
  s.world.destroyEntity(s.target);
  const replacement = entity(s.world, new EnemyComponent(), new TransformComponent(520, 400), new HealthComponent(1e9, 1e9));
  s.targeting.update(s.world, 0);
  new WeaponSystem().update(s.world, 0);
  const projectile = s.world.getComponent(s.world.getEntitiesWith(ProjectileComponent)[0], ProjectileComponent);
  assert.equal(projectile.targetEntityId, replacement);
  close(s.transform.rotation, Math.PI);
});

test('no targets preserve the last angle, while pause freezes aim and x3 advances it in game time', () => {
  const s = scene();
  s.world.registerSystem(s.targeting);
  s.world.isPaused = true;
  s.world.update(0.01);
  close(s.transform.rotation, 0);
  s.world.isPaused = false;
  s.world.gameSpeed = 3;
  s.world.update(0.01);
  close(s.transform.rotation, Math.PI * 12 / 35);
  s.world.destroyEntity(s.target);
  s.world._flushDestructionQueue();
  s.world.update(0.1);
  close(s.transform.rotation, Math.PI * 12 / 35);
});

test('ready towers smoothly pre-aim outside range without firing or activating rapid fire', () => {
  const s = scene();
  s.targetPosition.x = 300; // 300 from the tower, beyond the 200 attack range.
  s.attack.cooldown = 0;
  s.attack.rapidFireChance = 1;
  const weapon = new WeaponSystem();
  s.targeting.update(s.world, 0);
  close(s.transform.rotation, 0);
  s.targeting.update(s.world, 0.04375);
  close(s.transform.rotation, Math.PI / 2);
  weapon.update(s.world, 0.04375);
  assert.equal(s.world.getComponent(s.tower, TargetComponent).targetEntityId, s.target);
  assert.equal(s.world.getEntitiesWith(ProjectileComponent).length, 0);
  assert.equal(s.attack.rapidFireRemaining, 0);
  close(s.attack.cooldown, 0);
  s.targeting.update(s.world, 0.04375);
  close(s.transform.rotation, Math.PI);
});

test('pre-aim follows the closest outside enemy regardless of HP and ignores dead or queued enemies', () => {
  const s = scene();
  s.targetPosition.x = 300;
  const nearest = entity(s.world, new EnemyComponent(), new TransformComponent(600, 650), new HealthComponent(1, 1));
  const dead = entity(s.world, new EnemyComponent(), new TransformComponent(390, 400), new HealthComponent(0, 10));
  const queued = entity(s.world, new EnemyComponent(), new TransformComponent(810, 400), new HealthComponent(100, 100));
  s.world.destroyEntity(queued);
  s.targeting.update(s.world, 0.01);
  const tracking = s.world.getComponent(s.tower, TargetComponent);
  assert.equal(tracking.targetEntityId, nearest);
  s.world.destroyEntity(nearest);
  s.targeting.update(s.world, 0.01);
  assert.equal(tracking.targetEntityId, s.target);
  s.world.destroyEntity(s.target);
  s.targeting.update(s.world, 0.01);
  assert.equal(tracking.targetEntityId, null);
  assert.equal(s.world.getComponent(dead, HealthComponent).current, 0);
});

test('entering attack range fires at the boundary without a new aiming delay', () => {
  const s = scene();
  s.targetPosition.x = 300;
  s.attack.cooldown = 0;
  const weapon = new WeaponSystem();
  for (let frame = 0; frame < 12; frame++) {
    s.targeting.update(s.world, 0.01);
    weapon.update(s.world, 0.01);
  }
  assert.equal(s.world.getEntitiesWith(ProjectileComponent).length, 0);
  close(s.transform.rotation, Math.PI);
  s.targetPosition.x = 399; // Still one pixel outside range.
  s.targeting.update(s.world, 0.01);
  weapon.update(s.world, 0.01);
  assert.equal(s.world.getEntitiesWith(ProjectileComponent).length, 0);
  s.targetPosition.x = 400; // Exactly on the 200-pixel boundary.
  s.targeting.update(s.world, 0);
  weapon.update(s.world, 0);
  assert.equal(s.world.getEntitiesWith(ProjectileComponent).length, 1);
  close(s.transform.rotation, Math.PI);
});

test('each volley chooses the nearest in-range target instead of retaining a farther previous target', () => {
  const s = scene();
  s.attack.cooldown = 0;
  const nearerPosition = new TransformComponent(640, 400);
  const nearer = entity(s.world, new EnemyComponent(), nearerPosition, new HealthComponent(1000, 1000));
  const tracking = s.world.getComponent(s.tower, TargetComponent);
  tracking.targetEntityId = s.target;
  const firedAt = [];
  s.world.eventBus.on('PROJECTILE_FIRED', event => firedAt.push(event.targetId));
  const weapon = new WeaponSystem();
  weapon.update(s.world, 0);
  assert.equal(firedAt[0], nearer);
  nearerPosition.x = 750; // This previous target is now farther away than the original.
  s.attack.cooldown = 0;
  weapon.update(s.world, 0);
  assert.equal(firedAt[1], s.target);
});

test('a covered in-range enemy does not prevent pre-aim at the next outside enemy', () => {
  const s = scene(0);
  s.world.getComponent(s.target, HealthComponent).current = 20;
  s.attack.cooldown = 0;
  const weapon = new WeaponSystem();
  weapon.update(s.world, 0); // This bullet is already sufficient for the only in-range enemy.
  const outside = entity(s.world, new EnemyComponent(), new TransformComponent(300, 400), new HealthComponent(1000, 1000));
  s.attack.cooldown = 0;
  s.targeting.update(s.world, 0.11875); // 0.075 post-shot hold, then a half turn.
  weapon.update(s.world, 0.11875);
  assert.equal(s.world.getComponent(s.tower, TargetComponent).targetEntityId, outside);
  assert.equal(s.world.getEntitiesWith(ProjectileComponent).length, 1);
  close(s.transform.rotation, Math.PI / 2);
});

test('multishot includes only the closest in-range enemies even when previously tracking outside', () => {
  const s = scene(0);
  s.targetPosition.x = 850;
  s.attack.cooldown = 0;
  const outside = entity(s.world, new EnemyComponent(), new TransformComponent(1050, 400), new HealthComponent(1000, 1000));
  const second = entity(s.world, new EnemyComponent(), new TransformComponent(600, 710), new HealthComponent(1000, 1000));
  const weapon = new WeaponSystem();
  s.targeting.update(s.world, 0.01);
  weapon.update(s.world, 0.01);
  assert.equal(s.world.getEntitiesWith(ProjectileComponent).length, 0);
  s.attack.range = 400;
  s.attack.multishotChance = 1;
  s.targeting.update(s.world, 0);
  weapon.update(s.world, 0);
  const targets = s.world.getEntitiesWith(ProjectileComponent).map(id => s.world.getComponent(id, ProjectileComponent).targetEntityId);
  assert.deepEqual(targets, [s.target, second]);
  assert.ok(!targets.includes(outside));
});

test('outside tracking respects game speed while retaining the same attack range', () => {
  for (const gameSpeed of [1, 3]) {
    const s = scene();
    s.targetPosition.x = 300;
    s.attack.cooldown = 0;
    s.world.gameSpeed = gameSpeed;
    s.world.registerSystem(s.targeting);
    s.world.registerSystem(new WeaponSystem());
    s.world.update(0.01);
    close(s.transform.rotation, Math.PI * 4 / 35 * gameSpeed);
    assert.equal(s.world.getEntitiesWith(ProjectileComponent).length, 0);
  }
});

test('the barrel retains its firing direction through the hold, then turns toward the next target', () => {
  const s = scene(0);
  s.attack.cooldown = 0;
  s.world.getComponent(s.target, HealthComponent).current = 20;
  const next = entity(s.world, new EnemyComponent(), new TransformComponent(510, 400), new HealthComponent(1000, 1000));
  s.world.registerSystem(s.targeting);
  s.world.registerSystem(new WeaponSystem());
  s.world.update(0);
  close(s.attack.aimHoldRemaining, 0.075);
  s.world.update(0.025);
  assert.equal(s.world.getComponent(s.tower, TargetComponent).targetEntityId, next);
  close(s.transform.rotation, 0);
  close(s.attack.aimHoldRemaining, 0.05);
  s.world.isPaused = true;
  s.world.update(0.5);
  close(s.attack.aimHoldRemaining, 0.05);
  s.world.isPaused = false;
  s.world.update(0.05);
  close(s.transform.rotation, 0);
  close(s.attack.aimHoldRemaining, 0);
  s.world.update(0.021875);
  close(s.transform.rotation, Math.PI / 4);
  assert.equal(s.world.getEntitiesWith(ProjectileComponent).length, 1);
});

test('a frame crossing the end of the hold uses only its remaining portion to turn', () => {
  const s = scene(0);
  s.attack.cooldown = 0;
  s.world.registerSystem(s.targeting);
  s.world.registerSystem(new WeaponSystem());
  s.world.update(0);
  s.targetPosition.x = 520;
  s.world.update(0.085); // 0.075 held, 0.01 turning.
  close(s.transform.rotation, Math.PI * 1.6 * 0.01 / 0.14);
  close(s.attack.aimHoldRemaining, 0);
  close(s.attack.cooldown, 0.54);
});

test('post-shot holds scale with attack speed, rapid fire and game speed without a fixed frame delay', () => {
  for (const attackSpeed of [1.6, 10]) {
    for (const gameSpeed of [1, 3]) {
      for (const rapid of [false, true]) {
        const s = scene(0);
        Object.assign(s.attack, { attackSpeed, cooldown: 0, rapidFireRemaining: rapid ? 0.5 : 0 });
        s.world.gameSpeed = gameSpeed;
        s.world.registerSystem(s.targeting);
        s.world.registerSystem(new WeaponSystem());
        s.world.update(0);
        const hold = 0.12 / attackSpeed;
        close(s.attack.aimHoldRemaining, hold);
        s.targetPosition.x = 520;
        const halfHoldRealTime = hold / (2 * gameSpeed * (rapid ? 1.5 : 1));
        s.world.update(halfHoldRealTime);
        close(s.transform.rotation, 0);
        close(s.attack.aimHoldRemaining, hold / 2);
        s.world.update(halfHoldRealTime);
        close(s.transform.rotation, 0);
        close(s.attack.aimHoldRemaining, 0);
        s.world.update(0.001 / gameSpeed);
        assert.ok(s.transform.rotation > 0);
      }
    }
  }
});

test('post-shot holds expire even when no enemies remain to track', () => {
  const s = scene(0);
  s.attack.cooldown = 0;
  s.world.registerSystem(s.targeting);
  s.world.registerSystem(new WeaponSystem());
  s.world.update(0);
  s.world.destroyEntity(s.target);
  s.world._flushDestructionQueue();
  s.world.update(0.1);
  close(s.attack.aimHoldRemaining, 0);
  entity(s.world, new EnemyComponent(), new TransformComponent(300, 400), new HealthComponent(1000, 1000));
  s.world.update(0.01);
  assert.ok(s.transform.rotation > 0);
});

test('rapid fire expiring during a hold advances hold, turn and firing cooldown consistently', () => {
  const s = scene(0);
  Object.assign(s.attack, { cooldown: 0, rapidFireRemaining: 0.02 });
  s.world.registerSystem(s.targeting);
  s.world.registerSystem(new WeaponSystem());
  s.world.update(0);
  s.targetPosition.x = 520;
  s.world.update(0.07); // 0.08 baseline attack seconds: 0.075 held, 0.005 turning.
  close(s.transform.rotation, Math.PI * 1.6 * 0.005 / 0.14);
  close(s.attack.aimHoldRemaining, 0);
  close(s.attack.rapidFireRemaining, 0);
  close(s.attack.cooldown, 0.545);
});

function recordSchedule(smooth, attackSpeed, gameSpeed, rapid, multishot) {
  const s = scene(0);
  Object.assign(s.attack, { attackSpeed, cooldown: 0, rapidFireChance: rapid ? 0.2 : 0,
    rapidFireDuration: 0.5, multishotChance: multishot ? 0.2 : 0 });
  for (const y of [290, 510]) entity(s.world, new EnemyComponent(), new TransformComponent(600, y),
    new HealthComponent(1e9, 1e9), new CircleColliderComponent(5));
  if (smooth) s.world.registerSystem(s.targeting);
  s.world.registerSystem(new WeaponSystem());
  s.world.registerSystem(new CollisionSystem());
  s.world.gameSpeed = gameSpeed;
  const shots = [];
  const aimErrors = [];
  let frame = 0;
  let intermediateAngles = 0;
  s.world.eventBus.on('PROJECTILE_FIRED', event => {
    const target = s.world.getComponent(event.targetId, TransformComponent);
    const direction = Math.atan2(target.y - 400, target.x - 600);
    aimErrors.push(error(s.transform.rotation, direction));
    shots.push([frame, event.shotsCount]);
  });
  const savedRandom = Math.random;
  Math.random = () => 0;
  try {
    for (; frame < 360; frame++) {
      const angle = Math.floor(frame / 7) % 2 === 0 ? 0 : Math.PI;
      s.targetPosition.x = 600 + Math.cos(angle) * 80;
      s.world.update(1 / 120);
      if (Math.abs(Math.sin(s.transform.rotation)) > 0.01) intermediateAngles++;
    }
  } finally { Math.random = savedRandom; }
  assert.ok(aimErrors.every(value => Math.abs(value) < 1e-9), 'every shot must match the barrel direction');
  return { shots, intermediateAngles };
}

for (const attackSpeed of [1.6, 10, 40]) {
  for (const gameSpeed of [1, 3]) {
    test(`smooth aiming preserves the full shot schedule at ${attackSpeed}/s and x${gameSpeed}, with rapid fire and multishot`, () => {
      for (const rapid of [false, true]) {
        for (const multishot of [false, true]) {
          const baseline = recordSchedule(false, attackSpeed, gameSpeed, rapid, multishot);
          const smooth = recordSchedule(true, attackSpeed, gameSpeed, rapid, multishot);
          assert.deepEqual(smooth.shots, baseline.shots);
          assert.ok(smooth.shots.length > 0);
          if (attackSpeed === 1.6) assert.ok(smooth.intermediateAngles > 0);
        }
      }
    });
  }
}
