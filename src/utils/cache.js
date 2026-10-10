'use strict';
/**
 * Tiny in-process TTL cache. Keys always include the active batch ids, so a new
 * upload naturally invalidates stale ladders (no redundant recalculation on repeat views).
 * Swap for Redis if you run more than one API instance.
 */
const config = require('../config');

class TTLCache {
  constructor(ttlSeconds, maxEntries = 500) {
    this.ttlMs = ttlSeconds * 1000;
    this.max = maxEntries;
    this.store = new Map();
    this.hits = 0;
    this.misses = 0;
  }
  get(key) {
    const e = this.store.get(key);
    if (!e || e.expires < Date.now()) {
      if (e) this.store.delete(key);
      this.misses += 1;
      return undefined;
    }
    this.hits += 1;
    return e.value;
  }
  set(key, value) {
    if (this.store.size >= this.max) this.store.delete(this.store.keys().next().value);
    this.store.set(key, { value, expires: Date.now() + this.ttlMs });
    return value;
  }
  async wrap(key, producer) {
    const cached = this.get(key);
    if (cached !== undefined) return cached;
    return this.set(key, await producer());
  }
  clear() { this.store.clear(); }
  stats() { return { size: this.store.size, hits: this.hits, misses: this.misses }; }
}

module.exports = new TTLCache(config.cacheTtlSeconds);
module.exports.TTLCache = TTLCache;
