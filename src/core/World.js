/**
 * World.js
 * Central ECS World managing entities, component pools, systems execution, and deferred cleanup.
 */

import { EntityManager } from './EntityManager.js';
import { EventBus } from './EventBus.js';

export class World {
  constructor() {
    this.entityManager = new EntityManager();
    this.eventBus = new EventBus();
    
    // Map<ComponentClass, Map<entityId, componentInstance>>
    this.componentStores = new Map();
    
    // Systems in execution order
    this.systems = [];

    // Entities queued for destruction at the end of the frame
    this.destructionQueue = new Set();

    // Runtime state
    this.isPaused = false;
    this.gameSpeed = 1.0;
    this.isGameOver = false;

    // Viewport dimensions
    this.width = 1200;
    this.height = 800;
  }

  /**
   * Helper to resolve component store key
   * @private
   */
  _getStoreKey(ComponentClass) {
    return ComponentClass;
  }

  /**
   * Helper to ensure component store exists
   * @private
   */
  _getStore(ComponentClass) {
    let store = this.componentStores.get(ComponentClass);
    if (!store) {
      store = new Map();
      this.componentStores.set(ComponentClass, store);
    }
    return store;
  }

  /**
   * Create a new entity ID
   * @returns {number}
   */
  createEntity() {
    return this.entityManager.createEntity();
  }

  /**
   * Attach a component instance to an entity
   * @param {number} entityId
   * @param {Object} componentInstance
   * @returns {Object} componentInstance
   */
  addComponent(entityId, componentInstance) {
    if (!this.entityManager.isAlive(entityId)) {
      console.warn(`Cannot add component to dead or non-existent entity ${entityId}`);
      return componentInstance;
    }
    const ComponentClass = componentInstance.constructor;
    const store = this._getStore(ComponentClass);
    store.set(entityId, componentInstance);
    return componentInstance;
  }

  /**
   * Retrieve a component instance for an entity
   * @param {number} entityId
   * @param {Function} ComponentClass
   * @returns {Object|null}
   */
  getComponent(entityId, ComponentClass) {
    const store = this.componentStores.get(ComponentClass);
    if (!store) return null;
    return store.get(entityId) || null;
  }

  /**
   * Check if an entity has a specific component
   * @param {number} entityId
   * @param {Function} ComponentClass
   * @returns {boolean}
   */
  hasComponent(entityId, ComponentClass) {
    const store = this.componentStores.get(ComponentClass);
    if (!store) return false;
    return store.has(entityId);
  }

  /**
   * Remove a component from an entity
   * @param {number} entityId
   * @param {Function} ComponentClass
   */
  removeComponent(entityId, ComponentClass) {
    const store = this.componentStores.get(ComponentClass);
    if (store) {
      store.delete(entityId);
    }
  }

  /**
   * Query all entities matching ALL specified component classes
   * @param  {...Function} componentClasses
   * @returns {number[]} Array of entity IDs
   */
  getEntitiesWith(...componentClasses) {
    if (componentClasses.length === 0) {
      return Array.from(this.entityManager.getActiveEntities());
    }

    // Find the smallest component pool for optimal iteration
    let smallestStore = null;
    let smallestSize = Infinity;

    for (const CompClass of componentClasses) {
      const store = this.componentStores.get(CompClass);
      if (!store || store.size === 0) {
        return []; // If any component pool is empty, intersection is empty
      }
      if (store.size < smallestSize) {
        smallestSize = store.size;
        smallestStore = store;
      }
    }

    const matches = [];
    for (const entityId of smallestStore.keys()) {
      // Skip queued for destruction
      if (this.destructionQueue.has(entityId)) continue;

      let hasAll = true;
      for (const CompClass of componentClasses) {
        const store = this.componentStores.get(CompClass);
        if (!store || !store.has(entityId)) {
          hasAll = false;
          break;
        }
      }
      if (hasAll) {
        matches.push(entityId);
      }
    }

    return matches;
  }

  /**
   * Queue an entity for deferred removal at the end of the current update tick
   * @param {number} entityId
   */
  destroyEntity(entityId) {
    if (this.entityManager.isAlive(entityId)) {
      this.destructionQueue.add(entityId);
    }
  }

  /**
   * Process deferred entity destructions and clean component pools
   * @private
   */
  _flushDestructionQueue() {
    if (this.destructionQueue.size === 0) return;

    for (const entityId of this.destructionQueue) {
      // Remove all components for this entity
      for (const store of this.componentStores.values()) {
        store.delete(entityId);
      }
      // Reclaim entity ID
      this.entityManager.destroyEntity(entityId);
    }
    this.destructionQueue.clear();
  }

  /**
   * Register a system to run on each frame
   * @param {Object} system
   */
  registerSystem(system) {
    if (typeof system.init === 'function') {
      system.init(this);
    }
    this.systems.push(system);
  }

  /**
   * Update all systems by deltaTime
   * @param {number} deltaTime In seconds
   */
  update(deltaTime) {
    if (this.isPaused) {
      // While paused, only run read-only render systems with 0 delta time
      for (const system of this.systems) {
        if (system.isRenderSystem || system.constructor.name === 'RenderSystem') {
          system.update(this, 0);
        }
      }
      return;
    }

    const scaledDt = deltaTime * this.gameSpeed;

    for (const system of this.systems) {
      system.update(this, scaledDt);
    }

    // Clean up dead entities safely between ticks
    this._flushDestructionQueue();
  }

  /**
   * Reset world and all entities
   */
  clear() {
    this.destructionQueue.clear();
    for (const store of this.componentStores.values()) {
      store.clear();
    }
    this.entityManager.clear();
    this.isGameOver = false;
  }
}
