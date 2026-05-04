/**
 * BullMQ Queue Configuration
 * Redis connection and queue setup
 */

import { QueueOptions, WorkerOptions } from 'bullmq';
import { Redis } from 'ioredis';
import { env } from '@/config/env.js';
import { logger } from '@/utils/logger.js';

// Redis connection
export const redisConnection = new Redis({
  host:                 env.REDIS_HOST,
  port:                 parseInt(env.REDIS_PORT),        // ← parse to number
  password:             env.REDIS_PASSWORD || undefined,
  db:                   parseInt(env.REDIS_DB),           // ← parse to number
  maxRetriesPerRequest: null,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    logger.warn(`Redis connection retry #${times}, waiting ${delay}ms`);
    return delay;
  },
});

// Redis connection event handlers
redisConnection.on('error', (err) => {
  logger.error('Redis connection error:', err);
});

redisConnection.on('connect', () => {
  logger.info('Redis connected successfully');
});

redisConnection.on('ready', () => {
  logger.info('Redis connection ready');
});

redisConnection.on('reconnecting', () => {
  logger.warn('Redis reconnecting...');
});

// Graceful shutdown
export const closeRedisConnection = async () => {
  try {
    await redisConnection.quit();
    logger.info('Redis connection closed gracefully');
  } catch (error) {
    logger.error('Error closing Redis connection:', error);
    await redisConnection.disconnect();
  }
};

// Handle process termination
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, closing Redis connection');
  await closeRedisConnection();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, closing Redis connection');
  await closeRedisConnection();
  process.exit(0);
});

// Queue options
export const defaultQueueOptions: QueueOptions = {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: {
      count: 100,
      age: 3600, // 1 hour
    },
    removeOnFail: {
      count: 500,
    },
    priority: 1,
  },
};

// Worker options
export const defaultWorkerOptions: Partial<WorkerOptions> = {
  connection: redisConnection,
  concurrency: parseInt(env.WORKER_CONCURRENCY) || 5,
  limiter: {
    max: 10,
    duration: 1000,
  },
};

// Queue names
export const QUEUE_NAMES = {
  SITE_MONITORING: 'site-monitoring',
  SITE_SYNC: 'site-sync',
  ALERT_PROCESSING: 'alert-processing',
  EMAIL_NOTIFICATION: 'email-notification',
} as const;

// Type for queue names
export type QueueName = typeof QUEUE_NAMES[keyof typeof QUEUE_NAMES];

// Queue-specific worker options
export const workerOptions: Record<QueueName, Partial<WorkerOptions>> = {
  [QUEUE_NAMES.SITE_MONITORING]: {
    ...defaultWorkerOptions,
    concurrency: 3, // Lower concurrency for intensive monitoring tasks
  },
  [QUEUE_NAMES.SITE_SYNC]: {
    ...defaultWorkerOptions,
    concurrency: 5,
  },
  [QUEUE_NAMES.ALERT_PROCESSING]: {
    ...defaultWorkerOptions,
    concurrency: 10, // Higher concurrency for alerts
  },
  [QUEUE_NAMES.EMAIL_NOTIFICATION]: {
    ...defaultWorkerOptions,
    concurrency: 10, // Higher concurrency for emails
  },
};

// Queue-specific options (optional, if you need different settings per queue)
export const queueOptions: Record<QueueName, QueueOptions> = {
  [QUEUE_NAMES.SITE_MONITORING]: {
    ...defaultQueueOptions,
  },
  [QUEUE_NAMES.SITE_SYNC]: {
    ...defaultQueueOptions,
  },
  [QUEUE_NAMES.ALERT_PROCESSING]: {
    ...defaultQueueOptions,
    defaultJobOptions: {
      ...defaultQueueOptions.defaultJobOptions,
      priority: 2, // Higher priority for alerts
    },
  },
  [QUEUE_NAMES.EMAIL_NOTIFICATION]: {
    ...defaultQueueOptions,
    defaultJobOptions: {
      ...defaultQueueOptions.defaultJobOptions,
      priority: 3, // Highest priority for notifications
    },
  },
};

// Utility function to get Redis credentials (for debugging/monitoring)
export const getRedisCredentials = () => {
  return {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    db: env.REDIS_DB,
    hasPassword: !!env.REDIS_PASSWORD,
    // Never expose the actual password
  };
};

// Health check function
export const checkRedisHealth = async (): Promise<boolean> => {
  try {
    await redisConnection.ping();
    return true;
  } catch (error) {
    logger.error('Redis health check failed:', error);
    return false;
  }
};

logger.info('Queue configuration initialized', getRedisCredentials());