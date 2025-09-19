export class RateLimitService {
  private rateLimits = new Map<string, { count: number; resetTime: number }>();
  private readonly RATE_LIMIT_WINDOW = 10000;
  private readonly MAX_REQUESTS_PER_MINUTE = 10;

  checkRateLimit(userId: string): boolean {
    const now = Date.now();
    const userLimit = this.rateLimits.get(userId);

    if (!userLimit || now > userLimit.resetTime) {
      this.rateLimits.set(userId, {
        count: 1,
        resetTime: now + this.RATE_LIMIT_WINDOW,
      });
      return true;
    }

    if (userLimit.count >= this.MAX_REQUESTS_PER_MINUTE) {
      return false;
    }

    userLimit.count++;
    return true;
  }
}
