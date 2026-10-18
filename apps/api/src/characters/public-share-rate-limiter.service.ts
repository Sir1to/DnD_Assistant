import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

interface RequestWindow {
  count: number;
  resetAt: number;
}

const WINDOW_MILLISECONDS = 60_000;
const REQUESTS_PER_WINDOW = 120;
const MAX_TRACKED_CLIENTS = 10_000;
const CLEANUP_INTERVAL_REQUESTS = 256;

@Injectable()
export class PublicShareRateLimiter {
  private readonly windows = new Map<string, RequestWindow>();
  private requestCount = 0;

  public consume(key: string, now = Date.now()): void {
    const clientKey = key.trim().slice(0, 128) || 'unknown';
    this.requestCount += 1;
    if (this.requestCount % CLEANUP_INTERVAL_REQUESTS === 0) {
      this.removeExpiredWindows(now);
    }

    const current = this.windows.get(clientKey);
    if (!current || current.resetAt <= now) {
      if (!current && this.windows.size >= MAX_TRACKED_CLIENTS) {
        this.removeExpiredWindows(now);
        if (this.windows.size >= MAX_TRACKED_CLIENTS) this.rejectRequest();
      }
      this.windows.set(clientKey, { count: 1, resetAt: now + WINDOW_MILLISECONDS });
      return;
    }
    if (current.count >= REQUESTS_PER_WINDOW) {
      this.rejectRequest();
    }
    current.count += 1;
  }

  private removeExpiredWindows(now: number): void {
    for (const [key, window] of this.windows) {
      if (window.resetAt <= now) this.windows.delete(key);
    }
  }

  private rejectRequest(): never {
    throw new HttpException(
      'Too many shared character requests. Try again later.',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
