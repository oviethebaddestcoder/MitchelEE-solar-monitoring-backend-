import { queueManager } from '@/queue/QueueManager.js';
import { logger } from '@/utils/logger.js';

async function monitorQueues() {
  logger.info('\n📊 Queue Monitoring Dashboard\n');
  logger.info('═'.repeat(80));

  try {
    const metrics = await queueManager.getAllMetrics();

    for (const metric of metrics) {
      logger.info(`\n📦 Queue: ${metric.queueName}`);
      logger.info(`├─ Waiting:   ${metric.waiting}`);
      logger.info(`├─ Active:    ${metric.active}`);
      logger.info(`├─ Completed: ${metric.completed}`);
      logger.info(`├─ Failed:    ${metric.failed}`);
      logger.info(`└─ Delayed:   ${metric.delayed}`);
    }

    logger.info('\n' + '═'.repeat(80));
    logger.info(`\n✅ Total queues: ${metrics.length}\n`);
  } catch (error) {
    logger.error('Error monitoring queues:', error);
  }

  process.exit(0);
}

monitorQueues();