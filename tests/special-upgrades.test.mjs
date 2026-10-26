import { ALL_UPGRADE_TIERS } from '../src/config/UpgradeTiers.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/core/World.js';
import { GameConfig } from '../src/config/GameConfig.js';
import { UpgradeManager } from '../src/managers/UpgradeManager.js';
import { TowerComponent } from '../src/components/TowerComponent.js';
import { AttackComponent } from '../src/components/AttackComponent.js';
import { DefenseComponent } from '../src/components/DefenseComponent.js';
import { ArmorComponent } from '../src/components/ArmorComponent.js';
import { EconomyComponent } from '../src/components/EconomyComponent.js';
import { HealthComponent } from '../src/components/HealthComponent.js';
import { EnemyComponent } from '../src/components/EnemyComponent.js';
import { TargetComponent } from '../src/components/TargetComponent.js';
import { TransformComponent } from '../src/components/TransformComponent.js';
import { VelocityComponent } from '../src/components/VelocityComponent.js';
import { CircleColliderComponent } from '../src/components/CircleColliderComponent.js';
import { ProjectileComponent } from '../src/components/ProjectileComponent.js';
import { CollisionSystem } from '../src/systems/CollisionSystem.js';
import { DamageSystem } from '../src/systems/DamageSystem.js';
import { EconomySystem } from '../src/systems/EconomySystem.js';
import { MovementSystem } from '../src/systems/MovementSystem.js';
import { WeaponSystem } from '../src/systems/WeaponSystem.js';
import { SniperAISystem } from '../src/systems/SniperAISystem.js';
import { PhysicsSeparationSystem } from '../src/systems/PhysicsSeparationSystem.js';
import { TargetingSystem } from '../src/systems/TargetingSystem.js';
import { WaveSystem } from '../src/systems/WaveSystem.js';
import { ParticleSystem } from '../src/systems/ParticleSystem.js';
import { getExpectedInFlightDamage } from '../src/combat/DamageCalculation.js';

function entity(world, ...components) {
  const id = world.createEntity();
  for (const component of components) world.addComponent(id, component);
  return id;
}
function setup() {
  const world = new World();
  const tower = entity(world, new TowerComponent(), new AttackComponent(25, 1.6, 300),
    new DefenseComponent(), new ArmorComponent(), new HealthComponent(GameConfig.tower.baseHealth, GameConfig.tower.baseHealth),
    new EconomyComponent(10000), new TargetComponent(), new TransformComponent(),
    new CircleColliderComponent(26, 1000, true));
  world.registerSystem(new EconomySystem());
  const manager = new UpgradeManager({}, ALL_UPGRADE_TIERS);
  manager.init(world);
  manager.applyAll(world, tower);
  const damage = new DamageSystem();
  world.registerSystem(damage);
  return { world, tower, manager, damage, defense: world.getComponent(tower, DefenseComponent),
    attack: world.getComponent(tower, AttackComponent), health: world.getComponent(tower, HealthComponent) };
}
function enemy(world, x = 100, hp = 1000, type = 'scout', mass = 1) {
  return entity(world, new EnemyComponent(type), new TransformComponent(x, 0),
    new HealthComponent(hp, hp), new CircleColliderComponent(5, mass), new VelocityComponent(0, 0, 0, 0));
}
function hit(world, sourceId, targetId, damage) {
  world.eventBus.emit('PROJECTILE_HIT', { sourceId, targetId, damage, isCrit: false });
}
function forceRandom(callback, random = () => 0) {
  const saved = Math.random;
  Math.random = random;
  try { return callback(); } finally { Math.random = saved; }
}

test('new skills start inactive, secondary upgrades require their matching chance and purchases are charged once', () => {
  const { world, tower, manager, attack, defense } = setup();
  assert.equal(attack.ricochetChance, 0);
  assert.equal(attack.rapidFireChance, 0);
  assert.equal(defense.lifeSteal, 0);
  assert.equal(defense.damageReflection, 0);
  assert.equal(manager.getCurrentValue('rapidFireDuration'), 0.5);
  for (const [parent, child] of [['ricochetChance', 'ricochetCount'], ['rapidFireChance', 'rapidFireDuration'], ['knockbackChance', 'knockbackPower']]) {
    assert.equal(manager.buyUpgrade(child, world), false);
    const before = world.getComponent(tower, EconomyComponent).credits;
    const cost = manager.getCost(parent);
    assert.equal(manager.buyUpgrade(parent, world), true);
    assert.equal(world.getComponent(tower, EconomyComponent).credits, before - cost);
    assert.equal(manager.isUnlocked(child), true);
    assert.equal(manager.buyUpgrade(child, world), true);
  }
  assert.equal(attack.ricochetCount, 2);
  assert.ok(Math.abs(attack.rapidFireDuration - 0.65) < 1e-9);
  assert.equal(defense.knockbackPower, 35);
});

test('all upgrades remain available beyond their old level limits and keep their existing stat formulas', () => {
  const { world, tower, manager } = setup();
  world.getComponent(tower, EconomyComponent).credits = 1e35;
  for (const def of Object.values(GameConfig.upgrades)) {
    assert.equal(def.maxLevel, undefined);
    manager.levels.set(def.id, 100);
  }
  for (const def of Object.values(GameConfig.upgrades)) {
    const before = manager.getCurrentValue(def.id);
    assert.ok(manager.getNextValue(def.id) > before, def.id);
    assert.ok(Number.isFinite(manager.getCost(def.id)), def.id);
    assert.equal(manager.buyUpgrade(def.id, world), true, def.id);
    assert.equal(manager.getLevel(def.id), 101);
  }
});

test('rapid fire advances cooldown exactly x1.5, never refreshes while active, pauses, and can restart without recovery', () => {
  const { world, attack } = setup();
  enemy(world, 80, 1e9);
  attack.rapidFireChance = 0.3;
  attack.rapidFireDuration = 0.5;
  const weapon = new WeaponSystem();
  world.registerSystem(weapon);
  let procs = 0;
  world.eventBus.on('RAPID_FIRE_STARTED', () => procs++);
  forceRandom(() => {
    weapon.update(world, 0);
    assert.equal(procs, 1);
    assert.equal(attack.rapidFireRemaining, 0.5);
    weapon.update(world, 0.2);
    assert.ok(Math.abs(attack.cooldown - (1 / 1.6 - 0.3)) < 1e-9);
    world.isPaused = true;
    world.update(1);
    assert.equal(attack.rapidFireRemaining, 0.3);
    world.isPaused = false;
    attack.cooldown = 0;
    weapon.update(world, 0.1); // Another volley while active cannot refresh the buff.
    assert.equal(procs, 1);
    assert.ok(Math.abs(attack.rapidFireRemaining - 0.2) < 1e-9);
    weapon.update(world, 0.25); // Only 0.2 seconds of this frame are boosted.
    assert.equal(attack.rapidFireRemaining, 0);
    assert.ok(Math.abs(attack.cooldown - (1 / 1.6 - 0.35)) < 1e-9);
    attack.cooldown = 0;
    weapon.update(world, 0); // The first eligible volley after expiry may proc immediately.
    assert.equal(procs, 2);
    assert.equal(attack.rapidFireRemaining, 0.5);
  });
});

test('rapid fire chance has diminishing increments and both rapid upgrades remain purchasable beyond their former limits', () => {
  const { world, tower, manager, attack } = setup();
  let expected = 0;
  for (let level = 1; level <= 100; level++) {
    const before = manager.getCurrentValue('rapidFireChance');
    const increment = 0.01 * 0.98 ** (level - 1);
    expected += increment;
    manager.levels.set('rapidFireChance', level);
    const current = manager.getCurrentValue('rapidFireChance');
    assert.ok(Math.abs(current - expected) < 1e-12);
    assert.ok(Math.abs(current - before - increment) < 1e-12);
    assert.ok(current > before && current < 0.5);
  }
  world.getComponent(tower, EconomyComponent).credits = 1e30;
  for (const [id, level] of [['rapidFireChance', 100], ['rapidFireDuration', 100]]) {
    manager.levels.set(id, level);
    const next = manager.getNextValue(id);
    assert.ok(next > manager.getCurrentValue(id));
    assert.ok(Number.isFinite(manager.getCost(id)));
    assert.equal(manager.buyUpgrade(id, world), true);
    assert.equal(manager.getLevel(id), level + 1);
    assert.equal(attack[id], next);
  }
  assert.ok(Math.abs(attack.rapidFireDuration - 15.65) < 1e-9);
  manager.levels.set('rapidFireChance', 1000);
  assert.ok(Number.isFinite(manager.getCurrentValue('rapidFireChance')));
  assert.ok(manager.getCurrentValue('rapidFireChance') <= 0.5);
});

test('rapid fire activation keeps sparks but creates no floating text over the tower', () => {
  const world = new World();
  const particles = new ParticleSystem();
  world.registerSystem(particles);
  world.eventBus.emit('RAPID_FIRE_STARTED', { x: 10, y: 20, duration: 0.5 });
  assert.equal(particles.floatingTexts.length, 0);
  assert.ok(particles.particles.length > 0);
});

test('multishot rolls rapid fire once per volley, regardless of bullet count', () => {
  const { world, attack } = setup();
  for (const x of [70, 80, 90, 100]) enemy(world, x, 1e6);
  attack.rapidFireChance = 0.3;
  attack.multishotChance = 1;
  attack.multishotCount = 2;
  let rolls = 0;
  forceRandom(() => new WeaponSystem().update(world, 0), () => { rolls++; return 0; });
  assert.equal(rolls, 3); // One rapid-fire, one crit, one multishot roll.
  assert.equal(world.getEntitiesWith(ProjectileComponent).length, 3);
});

function combinedAttackSetup(rapid, multishot) {
  const world = new World();
  const attack = new AttackComponent(25, 1.6, 130, 0, 0, 1.6, 2, multishot ? 0.2 : 0, 0);
  Object.assign(attack, { rapidFireChance: rapid ? 0.2 : 0, rapidFireDuration: 2,
    ricochetChance: 0.25, ricochetCount: 2 });
  entity(world, new TowerComponent(), new TransformComponent(600, 400), new CircleColliderComponent(26, 1000, true),
    new HealthComponent(300, 300), attack, new TargetComponent());
  // Three separated firing lanes. Bounce targets are outside the initial attack range,
  // but within ricochet distance of the preceding enemy in their own lane.
  const lanes = [0, 2 * Math.PI / 3, 4 * Math.PI / 3].map(angle => [100, 160, 220].map(radius => {
    const id = enemy(world, 600 + Math.cos(angle) * radius, 1000);
    world.getComponent(id, TransformComponent).y = 400 + Math.sin(angle) * radius;
    return id;
  }));
  const movement = new MovementSystem();
  const weapon = new WeaponSystem();
  const collision = new CollisionSystem();
  for (const system of [movement, weapon, collision, new DamageSystem()]) world.registerSystem(system);
  return { world, attack, lanes, movement, weapon, collision };
}

for (const [name, rapid, multishot] of [
  ['ordinary multishot', false, true],
  ['rapid single shots', true, false],
  ['rapid multishot', true, true]
]) {
  test(`${name}: every fired bullet can complete its own ricochet chain and deal actual damage`, () => {
    const { world, attack, lanes } = combinedAttackSetup(rapid, multishot);
    const volleys = [];
    const bounces = [];
    let elapsed = 0;
    world.eventBus.on('PROJECTILE_FIRED', event => volleys.push({ ...event, time: elapsed, rapid: attack.rapidFireRemaining > 0 }));
    world.eventBus.on('PROJECTILE_RICOCHET', event => bounces.push(event));
    forceRandom(() => {
      world.update(0);
      for (let frame = 0; frame < 480; frame++) {
        elapsed += 1 / 240;
        world.update(1 / 240);
        if (volleys.length === 2 && world.getEntitiesWith(ProjectileComponent).length === 0) break;
      }
    });
    const shots = multishot ? 3 : 1;
    assert.equal(volleys.length, 2);
    assert.deepEqual(volleys.map(event => event.shotsCount), [shots, shots]);
    assert.deepEqual(volleys.map(event => event.rapid), [rapid, rapid]);
    const interval = 1 / (1.6 * (rapid ? 1.5 : 1));
    assert.ok(Math.abs(volleys[1].time - volleys[0].time - interval) < 2 / 240);
    assert.equal(bounces.length, 2 * shots * 2); // Two volleys, two bounces per bullet.
    for (const lane of lanes) {
      const firedAtLane = volleys[0].targetId === lane[0] || multishot;
      const loss = firedAtLane ? [50, 36, 26] : [0, 0, 0];
      for (let hop = 0; hop < lane.length; hop++) {
        assert.equal(world.getComponent(lane[hop], HealthComponent).current, 1000 - loss[hop]);
      }
    }
  });
}

test('ricochet chance rolls independently for each bullet of a rapid multishot volley', () => {
  const { world, lanes, movement, weapon, collision } = combinedAttackSetup(true, true);
  forceRandom(() => weapon.update(world, 0));
  const bullets = world.getEntitiesWith(ProjectileComponent);
  const bulletsByInitialTarget = new Map(bullets.map(id => {
    const projectile = world.getComponent(id, ProjectileComponent);
    return [projectile.targetEntityId, projectile];
  }));
  const rolls = [0.1, 0.9, 0.1]; // First and third chains succeed; second fails.
  let rollIndex = 0;
  forceRandom(() => {
    for (let frame = 0; frame < 240 && world.getEntitiesWith(ProjectileComponent).length; frame++) {
      movement.update(world, 1 / 240);
      collision.update(world, 1 / 240);
      world._flushDestructionQueue();
    }
  }, () => {
    assert.ok(rollIndex < rolls.length, 'a chain must not roll again at subsequent bounces');
    return rolls[rollIndex++];
  });
  assert.equal(bullets.length, 3);
  assert.equal(rollIndex, 3);
  assert.equal(world.getEntitiesWith(ProjectileComponent).length, 0);
  assert.deepEqual([...bulletsByInitialTarget.values()].map(p => p.ricochetActive).sort(), [false, true, true]);
  for (let lane = 0; lane < lanes.length; lane++) {
    const successful = bulletsByInitialTarget.get(lanes[lane][0]).ricochetActive;
    const loss = successful ? [25, 18, 13] : [25, 0, 0];
    for (let hop = 0; hop < 3; hop++) {
      assert.equal(world.getComponent(lanes[lane][hop], HealthComponent).current, 1000 - loss[hop]);
    }
  }
});

function ricochetSetup(firstHp = 1000) {
  const result = setup();
  const { world, tower } = result;
  const first = enemy(world, 100, firstHp);
  const second = enemy(world, 145);
  const third = enemy(world, 190);
  const projectile = new ProjectileComponent(tower, first, 0, 2.5, 100);
  projectile.ricochetChance = 1;
  projectile.ricochetsRemaining = 2;
  const bullet = entity(world, projectile, new TransformComponent(100, 0), new CircleColliderComponent(4), new VelocityComponent(550, 0, 550, 550));
  return { ...result, first, second, third, projectile, bullet, collision: new CollisionSystem() };
}

test('ricochet reuses one bullet, loses damage per hop, respects its hop limit and cannot hit the same enemy twice', () => {
  const { world, first, second, third, bullet, projectile, collision } = ricochetSetup();
  forceRandom(() => {
    collision.update(world, 0.1);
    assert.equal(world.getComponent(first, HealthComponent).current, 900);
    assert.equal(projectile.targetEntityId, second);
    assert.equal(projectile.damage, 70);
    assert.equal(getExpectedInFlightDamage(world).get(second), 70);
    world.getComponent(bullet, TransformComponent).x = 145;
    collision.update(world, 0.1);
    assert.equal(world.getComponent(second, HealthComponent).current, 930);
    assert.equal(projectile.targetEntityId, third);
    assert.equal(projectile.damage, 49);
    world.getComponent(bullet, TransformComponent).x = 100;
    collision.update(world, 0);
    assert.equal(world.getComponent(first, HealthComponent).current, 900);
    world.getComponent(bullet, TransformComponent).x = 190;
    collision.update(world, 0.1);
    assert.equal(world.getComponent(third, HealthComponent).current, 951);
    assert.equal(world.destructionQueue.has(bullet), true);
    assert.ok(Math.abs(projectile.lifetime - 0.3) < 1e-9);
  });
});

test('ricochet ends when no unvisited enemy is within its radius', () => {
  const { world, second, third, bullet, collision } = ricochetSetup();
  world.getComponent(second, TransformComponent).x = 220;
  world.getComponent(third, TransformComponent).x = 300;
  forceRandom(() => collision.update(world, 0));
  assert.equal(world.destructionQueue.has(bullet), true);
  assert.equal(world.getComponent(second, HealthComponent).current, 1000);
});

test('ricochet prediction and actual damage both respect Aegis protection', () => {
  const { world, second, bullet, projectile, collision } = ricochetSetup();
  enemy(world, 250, 1000, 'aegis');
  forceRandom(() => {
    collision.update(world, 0);
    assert.equal(projectile.targetEntityId, second);
    assert.equal(getExpectedInFlightDamage(world).get(second), 35);
    world.getComponent(bullet, TransformComponent).x = 145;
    collision.update(world, 0);
  });
  assert.equal(world.getComponent(second, HealthComponent).current, 965);
});

test('ricochet history tracks entity identity rather than recycled IDs after a kill', () => {
  const { world, first, bullet, collision } = ricochetSetup(10);
  forceRandom(() => {
    collision.update(world, 0);
    world._flushDestructionQueue();
    const replacement = enemy(world, 100);
    assert.equal(replacement, first);
    world.getComponent(bullet, TransformComponent).x = 100;
    collision.update(world, 0);
    assert.equal(world.getComponent(replacement, HealthComponent).current, 930);
  });
});

test('reflection uses post-armor HP loss, rounds down and does not trigger lifesteal', () => {
  const { world, tower, defense, health } = setup();
  const attacker = enemy(world, 40, 100);
  world.getComponent(attacker, EnemyComponent).damage = 40;
  Object.assign(world.getComponent(tower, ArmorComponent), { flatReduction: 10, percentReduction: 0.5 });
  defense.damageReflection = 0.5;
  defense.lifeSteal = 1;
  defense.lifeStealBudget = 100;
  world.eventBus.emit('TOWER_CONTACT', { enemyId: attacker });
  assert.equal(health.current, GameConfig.tower.baseHealth - 15);
  assert.equal(world.getComponent(attacker, HealthComponent).current, 93);
  assert.equal(defense.lifeStealBudget, 100);
});

test('a dead sniper cannot reflect damage into another enemy reusing its ID', () => {
  const { world, defense, health } = setup();
  defense.damageReflection = 0.5;
  const sniper = enemy(world, 100, 100, 'sniper');
  const originalHp = world.getComponent(sniper, HealthComponent);
  world.destroyEntity(sniper);
  world._flushDestructionQueue();
  const replacement = enemy(world, 100, 100);
  assert.equal(replacement, sniper);
  world.eventBus.emit('TOWER_HIT', { sourceId: sniper, sourceHealth: originalHp, damage: 20 });
  assert.equal(health.current, GameConfig.tower.baseHealth - 20);
  assert.equal(world.getComponent(replacement, HealthComponent).current, 100);
});

test('fatal tower damage reflects only the remaining HP and still ends the game', () => {
  const { world, defense, health } = setup();
  defense.damageReflection = 0.5;
  health.current = 5;
  const attacker = enemy(world, 40, 100);
  world.getComponent(attacker, EnemyComponent).damage = 100;
  world.eventBus.emit('TOWER_CONTACT', { enemyId: attacker });
  assert.equal(world.getComponent(attacker, HealthComponent).current, 98);
  assert.equal(health.current, 0);
  assert.equal(world.isGameOver, true);
});

test('sniper projectiles carry source identity and reflect into their living shooter', () => {
  const { world, tower, defense, health } = setup();
  defense.damageReflection = 0.5;
  const sniper = enemy(world, 100, 100, 'sniper');
  const ai = new SniperAISystem();
  ai._fireSniperProjectile(world, sniper, world.getComponent(sniper, TransformComponent), tower, world.getComponent(tower, TransformComponent), 20);
  const bullet = world.getEntitiesWith(ProjectileComponent)[0];
  world.getComponent(bullet, TransformComponent).x = 0;
  new CollisionSystem().update(world, 0);
  assert.equal(health.current, GameConfig.tower.baseHealth - 20);
  assert.equal(world.getComponent(sniper, HealthComponent).current, 90);
});

test('lifesteal uses actual damage, respects its healing budget and never exceeds maximum health', () => {
  const { world, tower, defense, health, damage } = setup();
  health.max = 100;
  health.current = 50;
  health.regenRate = 0;
  defense.lifeSteal = 0.05;
  damage.update(world, 1);
  const small = enemy(world, 100, 10);
  hit(world, tower, small, 1000);
  assert.equal(health.current, 50.5); // The 990 points of overkill give no healing.
  const large = enemy(world, 100, 1e6);
  hit(world, tower, large, 1000);
  assert.equal(health.current, 51.5); // 1.5% max HP per second, total.
  hit(world, tower, large, 1000);
  assert.equal(health.current, 51.5);
  damage.update(world, 0.5);
  hit(world, tower, large, 1000);
  assert.equal(health.current, 52.25);
  health.current = 99.9;
  damage.update(world, 1);
  hit(world, tower, large, 1000);
  assert.equal(health.current, 100);
});

for (const [type, mass, distance] of [['scout', 1, 80], ['tank', 8, 80 / Math.sqrt(8)], ['boss_architect', 30, 12], ['boss_shield', 15, 0]]) {
  test(`knockback handles ${type} resistance and exact travel time without refreshing on repeated hits`, () => {
    const { world, tower, defense } = setup();
    defense.knockbackChance = 1;
    defense.knockbackPower = 80;
    const victim = enemy(world, 100, 1000, type, mass);
    const state = world.getComponent(victim, EnemyComponent);
    const movement = new MovementSystem();
    forceRandom(() => {
      hit(world, tower, victim, 1);
      const cooldown = state.knockbackCooldown;
      hit(world, tower, victim, 1);
      assert.equal(state.knockbackCooldown, cooldown);
      movement.update(world, 0.08);
      movement.update(world, 0.2);
    });
    assert.ok(Math.abs(world.getComponent(victim, TransformComponent).x - (100 + distance)) < 1e-8);
    assert.equal(state.knockbackRemaining, 0);
  });
}

test('free upgrades roll at most once per completed wave/category, charge nothing and still raise future prices', () => {
  const { world, tower, manager } = setup();
  manager.levels.set('freeAttackChance', 8);
  manager.levels.set('freeDefenseChance', 8);
  manager.levels.set('freeEconomyChance', 10);
  const before = world.getComponent(tower, EconomyComponent).credits;
  let grants;
  world.eventBus.on('FREE_UPGRADES_GRANTED', event => { grants = event.granted; });
  forceRandom(() => world.eventBus.emit('WAVE_COMPLETED', { wave: 1 }));
  assert.equal(grants.length, 3);
  assert.deepEqual(grants.map(grant => grant.category), ['offense', 'defense', 'utility']);
  assert.equal(world.getComponent(tower, EconomyComponent).credits, before + 15);
  assert.equal(manager.getLevel('damage'), 1);
  assert.equal(manager.getCost('damage'), 6);
  assert.deepEqual(manager.rollFreeUpgrades(world, 1), []);
});

test('free upgrades exclude locked dependents but include skills beyond their former maximum', () => {
  const { world, manager } = setup();
  manager.levels.set('freeAttackChance', 8);
  manager.levels.set('critChance', 100);
  let roll = 0;
  const grants = forceRandom(() => manager.rollFreeUpgrades(world, 1), () => roll++ === 0 ? 0 : 0.999);
  assert.equal(grants.length, 1);
  assert.equal(grants[0].upgradeId, 'rapidFireChance');
  assert.equal(manager.getLevel('rapidFireDuration'), 0);
  assert.equal(manager.getLevel('critChance'), 100);
});

test('economy can upgrade its own chance once, without recursively awarding or opening additional rolls', () => {
  const { world, manager } = setup();
  manager.levels.set('freeEconomyChance', 1);
  let roll = 0;
  const grants = forceRandom(() => manager.rollFreeUpgrades(world, 1), () => roll++ === 0 ? 0 : 0.999);
  assert.equal(grants.length, 1);
  assert.equal(grants[0].upgradeId, 'freeEconomyChance');
  assert.equal(manager.getLevel('freeEconomyChance'), 2);
  assert.equal(manager.getLevel('damage'), 0);
  assert.equal(manager.getLevel('maxHealth'), 0);
  assert.deepEqual(manager.rollFreeUpgrades(world, 1), []);
});

test('free attack upgrades can increase rapid fire duration past its former maximum', () => {
  const { world, manager } = setup();
  manager.levels.set('freeAttackChance', 8);
  manager.levels.set('rapidFireChance', 6);
  manager.levels.set('rapidFireDuration', 10);
  let roll = 0;
  const grants = forceRandom(() => manager.rollFreeUpgrades(world, 1), () => roll++ === 0 ? 0 : 0.999);
  assert.equal(grants[0].upgradeId, 'rapidFireDuration');
  assert.equal(manager.getLevel('rapidFireDuration'), 11);
  assert.ok(Math.abs(manager.getCurrentValue('rapidFireDuration') - 2.15) < 1e-9);
});

test('failed chance rolls produce no rapid fire, ricochet, knockback or free level', () => {
  const { world, tower, manager, attack, defense } = setup();
  const target = enemy(world, 100, 1e9);
  attack.rapidFireChance = 0.3;
  defense.knockbackChance = 0.24;
  manager.levels.set('freeAttackChance', 8);
  manager.levels.set('freeDefenseChance', 8);
  manager.levels.set('freeEconomyChance', 10);
  forceRandom(() => {
    new WeaponSystem().update(world, 0);
    assert.equal(attack.rapidFireRemaining, 0);
    const projectile = new ProjectileComponent(tower, target, 0, 2.5, 25);
    projectile.ricochetChance = 0.25;
    projectile.ricochetsRemaining = 4;
    const bullet = entity(world, projectile, new TransformComponent(100, 0), new CircleColliderComponent(4), new VelocityComponent());
    new CollisionSystem().update(world, 0);
    assert.equal(world.destructionQueue.has(bullet), true);
    assert.equal(world.getComponent(target, EnemyComponent).knockbackRemaining, 0);
    assert.deepEqual(manager.rollFreeUpgrades(world, 1), []);
  }, () => 0.99);
});

test('full combat pipeline with all new abilities survives a seeded multiwave stress run without event errors', () => {
  const world = new World();
  const manager = new UpgradeManager({}, ALL_UPGRADE_TIERS);
  // Exercise free-upgrade callbacks deterministically; combat RNG remains seeded.
  const rollFreeUpgrades = manager.rollFreeUpgrades.bind(manager);
  manager.rollFreeUpgrades = (...args) => forceRandom(() => rollFreeUpgrades(...args));
  const waves = new WaveSystem();
  for (const system of [new MovementSystem(), new PhysicsSeparationSystem(), new TargetingSystem(),
    new SniperAISystem(), new WeaponSystem(), new CollisionSystem(), new DamageSystem(), waves,
    new EconomySystem(), new ParticleSystem()]) world.registerSystem(system);
  manager.init(world);
  const tower = entity(world, new TowerComponent(), new TransformComponent(600, 400),
    new CircleColliderComponent(26, 1000, true), new HealthComponent(600, 600), new ArmorComponent(),
    new AttackComponent(), new TargetComponent(), new DefenseComponent(), new EconomyComponent());
  for (const def of Object.values(GameConfig.upgrades).filter(def => def.baseValue !== undefined)) manager.levels.set(def.id, def.maxLevel || 30);
  for (const [id, level] of [['damage', 8], ['attackSpeed', 8], ['range', 6], ['maxHealth', 20], ['healthRegen', 8], ['armorPercent', 6], ['flatArmor', 6]]) manager.levels.set(id, level);
  manager.applyAll(world, tower);
  // Durable nearby targets exercise several ricochets in the real collision pipeline.
  for (let i = 0; i < 12; i++) {
    const id = enemy(world, 700 + i * 6, 600);
    world.getComponent(id, TransformComponent).y = 400;
    Object.assign(world.getComponent(id, VelocityComponent), { baseSpeed: 75, currentSpeed: 75 });
  }
  const counters = { rapid: 0, ricochet: 0, free: 0, waves: 0 };
  for (const [event, key] of [['RAPID_FIRE_STARTED', 'rapid'], ['PROJECTILE_RICOCHET', 'ricochet'],
    ['FREE_UPGRADES_GRANTED', 'free'], ['WAVE_COMPLETED', 'waves']]) world.eventBus.on(event, () => counters[key]++);
  const errors = [];
  const originalError = console.error;
  console.error = (...args) => errors.push(args);
  let seed = 74623;
  try {
    forceRandom(() => {
      waves.startFirstWave(world);
      for (let frame = 0; frame < 2400 && !world.isGameOver; frame++) {
        world.update(0.05);
        const hp = world.getComponent(tower, HealthComponent);
        assert.ok(Number.isFinite(hp.current) && hp.current >= 0 && hp.current <= hp.max);
        const budget = world.getComponent(tower, DefenseComponent).lifeStealBudget;
        assert.ok(budget >= 0 && budget <= hp.max * GameConfig.combat.lifeStealMaxHpPerSecond + 1e-9);
        for (const id of world.getEntitiesWith(TransformComponent)) {
          const position = world.getComponent(id, TransformComponent);
          assert.ok(Number.isFinite(position.x) && Number.isFinite(position.y));
        }
      }
    }, () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; });
  } finally { console.error = originalError; }
  assert.deepEqual(errors, []);
  assert.ok(counters.rapid > 0 && counters.ricochet > 0 && counters.free > 0 && counters.waves >= 3, JSON.stringify(counters));
});
