import { Redis } from '@upstash/redis';

// This requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN
// in your .env.local (local) and Vercel Environment Variables (production)
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default redis;