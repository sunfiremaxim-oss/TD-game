/**
 * EntityManager.js
 * Manages allocation, lifecycle, and recycling of unique Entity IDs.
 */

export class EntityManager {
  constructor() {
    this.nextId = 1;
    this.freeIds = [];
    this.activeEntities = new Set();
  }

  /**
   * Allocate a new unique Entity ID
   * @returns {number}
   */
  createEntity() {
    let id;
    if (this.freeIds.length > 0) {
      id = this.freeIds.pop();
    } else {
      id = this.nextId++;
    }
    this.activeEntities.add(id);
    return id;
  }

  /**
   * Mark an Entity ID as destroyed and reclaim it for reuse
   * @param {number} id
   */
  destroyEntity(id) {
    if (this.activeEntities.has(id)) {
      this.activeEntities.delete(id);
      this.freeIds.push(id);
      return true;
    }
    return false;
  }

  /**
   * Check if an entity is alive
   * @param {number} id
   * @returns {boolean}
   */
  isAlive(id) {
    return this.activeEntities.has(id);
  }

  /**
   * Get all active entity IDs
   * @returns {Set<number>}
   */
  getActiveEntities() {
    return this.activeEntities;
  }

  /**
   * Reset manager state
   */
  clear() {
    this.nextId = 1;
    this.freeIds = [];
    this.activeEntities.clear();
  }
}
