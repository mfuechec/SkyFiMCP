// Redis has been replaced with in-memory storage
// This file is kept for backwards compatibility but does nothing

export function getRedisClient(): any {
  throw new Error('Redis is disabled. Use in-memory SearchContextService instead.');
}

export async function closeRedisClient(): Promise<void> {
  // No-op: Redis is disabled
}
