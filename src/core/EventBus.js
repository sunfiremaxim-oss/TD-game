/**
 * EventBus.js
 * Decoupled publish-subscribe event system for cross-system and UI communication.
 */

export class EventBus {
  constructor() {
    this.listeners = new Map();
  }

  /**
   * Subscribe to an event
   * @param {string} event
   * @param {Function} callback
   * @returns {Function} Unsubscribe function
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);

    return () => this.off(event, callback);
  }

  /**
   * Unsubscribe from an event
   * @param {string} event
   * @param {Function} callback
   */
  off(event, callback) {
    const set = this.listeners.get(event);
    if (set) {
      set.delete(callback);
      if (set.size === 0) {
        this.listeners.delete(event);
      }
    }
  }

  /**
   * Publish an event to all subscribers
   * @param {string} event
   * @param {*} data
   */
  emit(event, data) {
    const set = this.listeners.get(event);
    if (set) {
      for (const callback of set) {
        try {
          callback(data);
        } catch (err) {
          console.error(`Error in EventBus listener for event "${event}":`, err);
        }
      }
    }
  }

  /**
   * Remove all listeners
   */
  clear() {
    this.listeners.clear();
  }
}
