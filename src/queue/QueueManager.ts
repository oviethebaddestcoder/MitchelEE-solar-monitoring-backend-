/**
 * Queue Manager
 * Central management for all BullMQ queues
 */

import { Queue } from 'bullmq';
import { defaultQueueOptions, QUEUE_NAMES } from './config.js';
import { logger } from '@/utils/logger.js';

class QueueManager {
  private queues: Map<string, Queue> = new Map();

  constructor() {
    this.initializeQueues();
  }

  private initializeQueues() {
    Object.values(QUEUE_NAMES).forEach((queueName) => {
      const queue = new Queue(queueName, defaultQueueOptions);
      this.queues.set(queueName, queue);
      logger.info(`Queue initialized: ${queueName}`);
    });
  }

  getQueue(name: string): Queue {
    const queue = this.queues.get(name);
    if (!queue) {
      throw new Error(`Queue not found: ${name}`);
    }
    return queue;
  }

  async addJob(queueName: string, jobName: string, data: any, options?: any) {
    const queue = this.getQueue(queueName);
    const job = await queue.add(jobName, data, options);
    logger.debug(`Job added to ${queueName}: ${jobName} (${job.id})`);
    return job;
  }

  async getQueueMetrics(queueName: string) {
    const queue = this.getQueue(queueName);
    
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ]);

    return {
      queueName,
      waiting,
      active,
      completed,
      failed,
      delayed,
      total: waiting + active + delayed,
    };
  }

  async getAllMetrics() {
    const metrics = await Promise.all(
      Array.from(this.queues.keys()).map((name) => this.getQueueMetrics(name))
    );
    return metrics;
  }

  async closeAll() {
    logger.info('Closing all queues...');
    await Promise.all(Array.from(this.queues.values()).map((queue) => queue.close()));
    logger.info('All queues closed');
  }
}

export const queueManager = new QueueManager();
