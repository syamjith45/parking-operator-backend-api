const Redis = require('ioredis');

const redisHost = process.env.REDIS_HOST || 'localhost';
const redisPort = process.env.REDIS_PORT || 6379;

const redis = new Redis({
    host: redisHost,
    port: redisPort,
    retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
    },
    maxRetriesPerRequest: 3,
    lazyConnect: true,
});

redis.on('connect', () => {
    console.log('✅ Redis connected successfully');
});

redis.on('error', (err) => {
    console.warn('⚠️ Redis connection error:', err.message);
});

redis.connect().catch((err) => {
    console.warn('⚠️ Redis failed to connect:', err.message);
});

module.exports = { redis };