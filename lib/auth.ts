import crypto from 'node:crypto';
import type { IncomingMessage } from 'node:http';

function sha256Digest(value: string): Buffer {
  return crypto.createHash('sha256').update(value, 'utf8').digest();
}

export function isAccessConfigured(): boolean {
  return Boolean(process.env.ACCESS_CODE?.trim());
}

export function verifyAccessCode(provided: string | string[] | undefined | null): {
  ok: boolean;
  configured: boolean;
  statusCode: number;
  message: string;
} {
  const expected = process.env.ACCESS_CODE?.trim() || '';
  if (!expected) {
    return {
      ok: false,
      configured: false,
      statusCode: 503,
      message: 'ACCESS_CODE is not configured on the server.',
    };
  }

  const candidate = Array.isArray(provided) ? provided[0] : provided;
  if (!candidate || typeof candidate !== 'string') {
    return {
      ok: false,
      configured: true,
      statusCode: 401,
      message: 'Access code is required.',
    };
  }

  const expectedHash = sha256Digest(expected);
  const candidateHash = sha256Digest(candidate.trim());
  const match = crypto.timingSafeEqual(expectedHash, candidateHash);

  if (!match) {
    return {
      ok: false,
      configured: true,
      statusCode: 401,
      message: 'Invalid access code.',
    };
  }

  return {
    ok: true,
    configured: true,
    statusCode: 200,
    message: 'OK',
  };
}

interface RateBucket {
  minuteTimestamps: number[];
  hourTimestamps: number[];
}

const ipBuckets = new Map<string, RateBucket>();
const MAX_PER_MINUTE = 20;
const MAX_PER_HOUR = 100;

export function getClientIp(req: IncomingMessage): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.trim()) {
    return fwd.split(',')[0].trim();
  }
  if (Array.isArray(fwd) && fwd.length > 0) {
    return fwd[0].split(',')[0].trim();
  }
  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp.trim()) {
    return realIp.trim();
  }
  return req.socket?.remoteAddress || 'unknown';
}

export function checkRateLimit(ip: string): { allowed: boolean; retryAfterSec?: number } {
  const now = Date.now();
  const oneMinuteAgo = now - 60_000;
  const oneHourAgo = now - 3_600_000;

  // Periodic cleanup if map grows large
  if (ipBuckets.size > 1000) {
    for (const [key, bucket] of ipBuckets.entries()) {
      const recent = bucket.hourTimestamps.filter((ts) => ts > oneHourAgo);
      if (recent.length === 0) {
        ipBuckets.delete(key);
      } else {
        bucket.hourTimestamps = recent;
        bucket.minuteTimestamps = bucket.minuteTimestamps.filter((ts) => ts > oneMinuteAgo);
      }
    }
  }

  let bucket = ipBuckets.get(ip);
  if (!bucket) {
    bucket = { minuteTimestamps: [], hourTimestamps: [] };
    ipBuckets.set(ip, bucket);
  }

  bucket.minuteTimestamps = bucket.minuteTimestamps.filter((ts) => ts > oneMinuteAgo);
  bucket.hourTimestamps = bucket.hourTimestamps.filter((ts) => ts > oneHourAgo);

  if (bucket.minuteTimestamps.length >= MAX_PER_MINUTE) {
    const oldest = bucket.minuteTimestamps[0];
    const retryAfterSec = Math.max(1, Math.ceil((oldest + 60_000 - now) / 1000));
    return { allowed: false, retryAfterSec };
  }

  if (bucket.hourTimestamps.length >= MAX_PER_HOUR) {
    const oldest = bucket.hourTimestamps[0];
    const retryAfterSec = Math.max(1, Math.ceil((oldest + 3_600_000 - now) / 1000));
    return { allowed: false, retryAfterSec };
  }

  bucket.minuteTimestamps.push(now);
  bucket.hourTimestamps.push(now);
  return { allowed: true };
}
