/**
 * Minimal LRU-bounded Set, backed by a Map (JS Maps preserve insertion
 * order, so the oldest entry is always map.keys().next().value). No new
 * dependency -- same "don't add infra nobody asked for" call as skipping
 * Redis for RuleEngine's counters.
 */
class LRUSet {
  constructor(maxSize) {
    this.maxSize = maxSize;
    this.map = new Map();
  }

  has(key) {
    return this.map.has(key);
  }

  /** Adds `key`, marking it most-recently-used; evicts the oldest entry once over capacity. */
  add(key) {
    if (this.map.has(key)) {
      this.map.delete(key); // re-insert to refresh recency
    }
    this.map.set(key, true);
    if (this.map.size > this.maxSize) {
      this.map.delete(this.map.keys().next().value);
    }
  }

  get size() {
    return this.map.size;
  }
}

module.exports = LRUSet;
