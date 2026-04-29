import CircuitBreaker from 'opossum';
import { env } from '@/config/env.js';
import { logger } from '@/utils/logger.js';

export function createCircuitBreaker<TArgs extends unknown[], TReturn>(
  fn: (...args: TArgs) => Promise<TReturn>,
  name: string
): CircuitBreaker<TArgs, TReturn> {
  const breaker = new CircuitBreaker(fn, {
    timeout: Number(env.CIRCUIT_BREAKER_TIMEOUT),
    errorThresholdPercentage: Number(env.CIRCUIT_BREAKER_ERROR_THRESHOLD),
    resetTimeout: Number(env.CIRCUIT_BREAKER_RESET_TIMEOUT),
    name,
  });

  breaker.on('open', () => {
    logger.warn(`Circuit breaker OPEN: ${name} - Too many failures`);
  });

  breaker.on('halfOpen', () => {
    logger.info(`Circuit breaker HALF-OPEN: ${name} - Testing recovery`);
  });

  breaker.on('close', () => {
    logger.info(`Circuit breaker CLOSED: ${name} - Service healthy`);
  });

  return breaker;
}