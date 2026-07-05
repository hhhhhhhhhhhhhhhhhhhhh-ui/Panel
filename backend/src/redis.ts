import { createClient } from 'redis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

const redisClient = createClient({
  url: redisUrl,
});

redisClient.on('error', () => {}); // Mute errors

let isMockMode = true; // Default to secure mock mode, prevent offline queue hanging
const mockStore = new Map<string, string>();

(async () => {
  try {
    // Attempt connection
    await redisClient.connect();
    isMockMode = false; // Switch to live Redis only after successful connection
    console.log('Connected to local Redis session store.');
  } catch (err) {
    console.warn('⚠️ Local Redis session store offline. Falling back to logless In-Memory session store.');
    isMockMode = true;
  }
})();

// Intercept Redis client commands to route via memory Map if Redis is offline
const originalSet = redisClient.set.bind(redisClient);
redisClient.set = (async (key: string, value: string, options?: any) => {
  if (!isMockMode) {
    try {
      return await originalSet(key, value, options);
    } catch {
      isMockMode = true;
    }
  }
  mockStore.set(key, value);
  return 'OK';
}) as any;

const originalGet = redisClient.get.bind(redisClient);
redisClient.get = (async (key: string) => {
  if (!isMockMode) {
    try {
      return await originalGet(key);
    } catch {
      isMockMode = true;
    }
  }
  return mockStore.get(key) || null;
}) as any;

const originalDel = redisClient.del.bind(redisClient);
redisClient.del = (async (...args: any[]) => {
  if (!isMockMode) {
    try {
      return await (originalDel as any)(...args);
    } catch {
      isMockMode = true;
    }
  }
  const keys = Array.isArray(args[0]) ? args[0] : args;
  keys.forEach((key: string) => mockStore.delete(key));
  return 1;
}) as any;

const originalIncr = redisClient.incr.bind(redisClient);
redisClient.incr = (async (key: string) => {
  if (!isMockMode) {
    try {
      return await originalIncr(key);
    } catch {
      isMockMode = true;
    }
  }
  const current = Number(mockStore.get(key) || 0);
  const next = current + 1;
  mockStore.set(key, next.toString());
  return next;
}) as any;

const originalExpire = redisClient.expire.bind(redisClient);
redisClient.expire = (async (key: string, seconds: number) => {
  return 1;
}) as any;

const originalKeys = redisClient.keys.bind(redisClient);
redisClient.keys = (async (pattern: string) => {
  if (!isMockMode) {
    try {
      return await originalKeys(pattern);
    } catch {
      isMockMode = true;
    }
  }
  // Convert Redis wildcard '*' to RegExp wildcard '.*'
  const regexPattern = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
  const matched: string[] = [];
  for (const key of mockStore.keys()) {
    if (regexPattern.test(key)) {
      matched.push(key);
    }
  }
  return matched;
}) as any;

export default redisClient;
