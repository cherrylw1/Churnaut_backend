import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || '',
  token: process.env.UPSTASH_REDIS_REST_TOKEN || '',
});

// Rate limiter: 100 requests per 10 seconds per IP (resolve, signup, webhook)
export const ratelimit = new Ratelimit({
  redis: redis,
  limiter: Ratelimit.slidingWindow(100, '10 s'),
  analytics: true,
  prefix: '@upstash/ratelimit',
});

// Rate limiter for support chat: 20 requests per 60 seconds per clientId
export const supportChatRatelimit = new Ratelimit({
  redis: redis,
  limiter: Ratelimit.slidingWindow(20, '60 s'),
  analytics: true,
  prefix: 'support-chat',
});
