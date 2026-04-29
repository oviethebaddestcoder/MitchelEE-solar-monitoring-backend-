import { enterpriseScheduler } from './scheduler.enterprise.js';
import { logger } from '@/utils/logger.js';

export function startAllJobs() {
  logger.info('Starting all background jobs...');
  enterpriseScheduler.startAll();
}