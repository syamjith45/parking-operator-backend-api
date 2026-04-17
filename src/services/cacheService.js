const { redis } = require('../config/redis');

// Default TTL values (in seconds)
const TTL = {
    PRICING: 3600,          // 1 hour
    DASHBOARD_STATS: 60,    // 1 minute
    DASHBOARD_ACTIVE: 30,   // 30 seconds
    TRANSACTIONS: 30,       // 30 seconds
    REVENUE: 300,           // 5 minutes
    ORGANIZATION: 3600,     // 1 hour
    SPACE: 900,            // 15 minutes
    STAFF: 900,             // 15 minutes
};

/**
 * Get value from cache
 * @param {string} key - Cache key
 * @returns {Promise<object|null>} Parsed JSON or null
 */
async function get(key) {
    try {
        const data = await redis.get(key);
        return data ? JSON.parse(data) : null;
    } catch (err) {
        console.warn('Cache get error:', err.message);
        return null;
    }
}

/**
 * Set value in cache with TTL
 * @param {string} key - Cache key
 * @param {any} value - Value to cache
 * @param {number} ttlSeconds - TTL in seconds (optional)
 */
async function set(key, value, ttlSeconds = 60) {
    try {
        await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (err) {
        console.warn('Cache set error:', err.message);
    }
}

/**
 * Delete a specific key from cache
 * @param {string} key - Cache key to delete
 */
async function del(key) {
    try {
        await redis.del(key);
    } catch (err) {
        console.warn('Cache del error:', err.message);
    }
}

/**
 * Delete keys matching a pattern
 * @param {string} pattern - Key pattern (e.g., 'pricing:*')
 */
async function invalidatePattern(pattern) {
    try {
        const keys = await redis.keys(pattern);
        if (keys.length > 0) {
            await redis.del(...keys);
        }
    } catch (err) {
        console.warn('Cache invalidate error:', err.message);
    }
}

/**
 * Invalidate cache for a specific space
 * @param {string} spaceId - Space ID
 */
async function invalidateSpaceCache(spaceId) {
    await invalidatePattern(`*:${spaceId}`);
    await invalidatePattern(`pricing:space:${spaceId}`);
}

/**
 * Invalidate all dashboard caches for a space
 * @param {string} spaceId - Space ID
 */
async function invalidateDashboardCache(spaceId) {
    await invalidatePattern(`dashboard:stats:${spaceId}`);
    await invalidatePattern(`dashboard:active:${spaceId}`);
}

/**
 * Invalidate all transaction caches for a space
 * @param {string} spaceId - Space ID
 */
async function invalidateTransactionCache(spaceId) {
    await invalidatePattern(`transactions:${spaceId}:*`);
}

/**
 * Invalidate all revenue caches for a space
 * @param {string} spaceId - Space ID
 */
async function invalidateRevenueCache(spaceId) {
    await invalidatePattern(`revenue:${spaceId}:*`);
}

module.exports = {
    get,
    set,
    del,
    invalidatePattern,
    invalidateSpaceCache,
    invalidateDashboardCache,
    invalidateTransactionCache,
    invalidateRevenueCache,
    TTL,
};