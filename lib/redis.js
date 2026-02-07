import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL;

let redis = global.redis;

if (!redis) {
  if (REDIS_URL) {
    // Only initialize if URL exists
    redis = new Redis(REDIS_URL, {
      retryStrategy: (times) => Math.min(times * 50, 2000),
      connectTimeout: 5000, 
      maxRetriesPerRequest: 1, // Fail fast if Redis is down
    });
    
    // Silent error handler to prevent crashing the process
    redis.on('error', (err) => {
        console.warn('[Redis] Connection Error (Ignoring):', err.message);
    });

    global.redis = redis;
  } else {
    console.warn('[Redis] No REDIS_URL found. Caching disabled.');
    redis = null; // Set to null so we can check later
  }
}

export default redis;