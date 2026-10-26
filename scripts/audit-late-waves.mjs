// Deterministic headless lifecycle audit, not a balance simulation or GPU benchmark.
import assert from 'node:assert/strict';
import { World } from '../src/core/World.js';
import { GameConfig } from '../src/config/GameConfig.js';
import { TowerComponent } from '../src/components/TowerComponent.js';
import { TransformComponent } from '../src/components/TransformComponent.js';
import { CircleColliderComponent } from '../src/components/CircleColliderComponent.js';
import { HealthComponent } from '../src/components/HealthComponent.js';
import { ArmorComponent } from '../src/components/ArmorComponent.js';
import { AttackComponent } from '../src/components/AttackComponent.js';
import { TargetComponent } from '../src/components/TargetComponent.js';
import { DefenseComponent } from '../src/components/DefenseComponent.js';
import { EconomyComponent } from '../src/components/EconomyComponent.js';
import { RenderComponent } from '../src/components/RenderComponent.js';
import { EnemyComponent } from '../src/components/EnemyComponent.js';
import { ProjectileComponent } from '../src/components/ProjectileComponent.js';
import { MovementSystem } from '../src/systems/MovementSystem.js';
import { PhysicsSeparationSystem } from '../src/systems/PhysicsSeparationSystem.js';
import { TargetingSystem } from '../src/systems/TargetingSystem.js';
import { SniperAISystem } from '../src/systems/SniperAISystem.js';
import { WeaponSystem } from '../src/systems/WeaponSystem.js';
import { CollisionSystem } from '../src/systems/CollisionSystem.js';
import { DamageSystem } from '../src/systems/DamageSystem.js';
import { WaveSystem } from '../src/systems/WaveSystem.js';
import { EconomySystem } from '../src/systems/EconomySystem.js';
import { ParticleSystem } from '../src/systems/ParticleSystem.js';
import { AudioSystem } from '../src/systems/AudioSystem.js';

const world = new World();
world.width = 1400; world.height = 900;
const waves = new WaveSystem(), particles = new ParticleSystem();
for (const system of [new MovementSystem(), new PhysicsSeparationSystem(), new TargetingSystem(),
  new SniperAISystem(), new WeaponSystem(), new CollisionSystem(), new DamageSystem(), waves,
  new EconomySystem(), particles, new AudioSystem()]) world.registerSystem(system);
const tower = world.createEntity();
const attack = new AttackComponent(400, 12, 290, 0, 0.3, 3, 3, 0.3, 0);
Object.assign(attack, { ricochetChance: 0.2, ricochetCount: 3, rapidFireChance: 0.2, rapidFireDuration: 1 });
for (const c of [new TowerComponent(), new TransformComponent(700, 450),
  new CircleColliderComponent(26, 1000, true), new HealthComponent(1e9, 1e9),
  new ArmorComponent(), attack, new TargetComponent(), new DefenseComponent(),
  new EconomyComponent(), new RenderComponent('tower', 8, 26)]) world.addComponent(tower, c);
const componentCount = () => [...world.componentStores.values()].reduce((sum, store) => sum + store.size, 0);
const listenerCount = () => [...world.eventBus.listeners.values()].reduce((sum, set) => sum + set.size, 0);
const baseline = { components: componentCount(), listeners: listenerCount(), systems: world.systems.length };
const peak = { enemies: 0, projectiles: 0, particles: 0, shockwaves: 0, texts: 0 };
const seenTypes = new Set(), checkpoints = [];
const timings = new Map(world.systems.map(system => [system.constructor.name, { activeMs: 0, idleMs: 0, active: 0, idle: 0 }]));
for (const system of world.systems) {
  const update = system.update.bind(system), stat = timings.get(system.constructor.name);
  system.update = (w, dt) => {
    const idle = waves.state === 'INTERMISSION' && waves.intermissionTimer < 1;
    const start = performance.now(); update(w, dt);
    stat[idle ? 'idleMs' : 'activeMs'] += performance.now() - start;
    stat[idle ? 'idle' : 'active']++;
  };
}
let seed = 153726, lastChecked = 0;
const originalRandom = Math.random;
const errors = [], originalError = console.error;
Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
console.error = (...args) => errors.push(args);
try {
  waves.startFirstWave(world);
  for (let frame = 0; frame < 180000 && lastChecked < 40; frame++) {
    world.update(1 / 30);
    const enemies = world.getEntitiesWith(EnemyComponent);
    for (const id of enemies) seenTypes.add(world.getComponent(id, EnemyComponent).type);
    peak.enemies = Math.max(peak.enemies, enemies.length);
    peak.projectiles = Math.max(peak.projectiles, world.getEntitiesWith(ProjectileComponent).length);
    peak.particles = Math.max(peak.particles, particles.particles.length);
    peak.shockwaves = Math.max(peak.shockwaves, particles.shockwaves.length);
    peak.texts = Math.max(peak.texts, particles.floatingTexts.length);
    if (waves.state === 'INTERMISSION' && waves.intermissionTimer < 0.4 && lastChecked !== waves.currentWave - 1) {
      lastChecked = waves.currentWave - 1;
      assert.equal(world.entityManager.activeEntities.size, 1, `entities after wave ${lastChecked}`);
      assert.equal(componentCount(), baseline.components);
      assert.equal(listenerCount(), baseline.listeners);
      assert.equal(world.systems.length, baseline.systems);
      assert.equal(world.destructionQueue.size, 0);
      assert.equal(particles.particles.length + particles.shockwaves.length + particles.floatingTexts.length, 0);
      if ([1, 10, 20, 29, 34, 40].includes(lastChecked)) {
        globalThis.gc?.();
        checkpoints.push({ wave: lastChecked, entities: 1, components: componentCount(), listeners: listenerCount(),
          heapMiB: +(process.memoryUsage().heapUsed / 1048576).toFixed(2) });
      }
    }
  }
  assert.equal(lastChecked, 40, 'simulation must finish forty waves');
  assert.deepEqual(errors, []);
  assert.equal(seenTypes.size, Object.keys(GameConfig.enemies).length);
} finally { Math.random = originalRandom; console.error = originalError; }
console.log(JSON.stringify({ checkpoints, peak, types: [...seenTypes], cpuMillisecondsPerFrame:
  Object.fromEntries([...timings].map(([name, s]) => [name, {
    active: +(s.activeMs / s.active).toFixed(4), idle: +(s.idleMs / s.idle).toFixed(4) }])) }, null, 2));
