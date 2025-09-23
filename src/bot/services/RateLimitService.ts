export function createRateLimiter() {
  const rateLimits = new Map<string, { count: number; resetTime: number }>();
  const RATE_LIMIT_WINDOW = 10000;
  const MAX_REQUESTS_PER_MINUTE = 10;

  function checkRateLimit(userId: string): boolean {
    const now = Date.now();
    const userLimit = rateLimits.get(userId);

    if (!userLimit || now > userLimit.resetTime) {
      rateLimits.set(userId, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
      return true;
    }

    if (userLimit.count >= MAX_REQUESTS_PER_MINUTE) return false;

    userLimit.count++;
    return true;
  }

  return { checkRateLimit };
}
