import { RateLimiterMemory } from 'rate-limiter-flexible';
import { Request, Response, NextFunction } from 'express';
import { env } from '@/config/env.js';

const rateLimiter = new RateLimiterMemory({
  points: env.rateLimitMaxRequests,
  duration: env.rateLimitWindowMs / 1000,
});

export async function rateLimiterMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const key = req.ip || 'unknown';
    await rateLimiter.consume(key);
    next();
  } catch (error) {
    res.status(429).json({
      success: false,
      message: 'Too many requests',
    });
  }
}