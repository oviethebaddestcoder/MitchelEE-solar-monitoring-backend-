import { workerManager } from '@/workers/index.js';
import { logger } from '@/utils/logger.js';

async function checkWorkerStatus() {
  logger.info('\n Worker Status Dashboard\n');
  logger.info('═'.repeat(80));

  try {
    const stats = workerManager.getWorkerStats();

    for (const stat of stats) {
      const status = stat.isRunning ? ' Running' : ' Stopped';
      const paused = stat.isPaused ? ' (⏸  Paused)' : '';
      
      logger.info(`${status}${paused} - ${stat.name}`);
    }

    logger.info('\n' + '═'.repeat(80) + '\n');
  } catch (error) {
    logger.error('Error checking worker status:', error);
  }

  process.exit(0);
}

checkWorkerStatus();