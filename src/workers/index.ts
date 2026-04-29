import { Worker } from 'bullmq';
import { defaultWorkerOptions, QUEUE_NAMES } from '@/queue/config.js';
import { processSiteMonitoring } from './siteMonitoring.worker.js';
import { processSiteSync } from './siteSync.worker.js';
import { processEmailNotification } from './emailNotification.worker.js';
import { logger } from '@/utils/logger.js';

class WorkerManager {
  private workers: Worker[] = [];

  start() {
    logger.info(' Starting worker pool...');

    // Site Monitoring Worker
    const monitoringWorker = new Worker(
      QUEUE_NAMES.SITE_MONITORING,
      processSiteMonitoring,
      {
        ...defaultWorkerOptions,
        concurrency: 5,
        connection: defaultWorkerOptions.connection!, // Ensure connection is always defined
      }
    );

    // Site Sync Worker
    const syncWorker = new Worker(
      QUEUE_NAMES.SITE_SYNC,
      processSiteSync,
      {
        ...defaultWorkerOptions,
        concurrency: 1, // Only one sync at a time
        connection: defaultWorkerOptions.connection!,
      }
    );

    // Email Notification Worker
    const emailWorker = new Worker(
      QUEUE_NAMES.EMAIL_NOTIFICATION,
      processEmailNotification,
      {
        ...defaultWorkerOptions,
        concurrency: 3,
        connection: defaultWorkerOptions.connection!,
      }
    );

    this.workers.push(monitoringWorker, syncWorker, emailWorker);

    // Setup event listeners for all workers
    this.setupWorkerEvents(monitoringWorker, 'Site Monitoring');
    this.setupWorkerEvents(syncWorker, 'Site Sync');
    this.setupWorkerEvents(emailWorker, 'Email Notification');

    logger.info(`✅ Started ${this.workers.length} workers`);
    logger.info(`Total concurrency: ${5 + 1 + 3} = 9 jobs in parallel`);
  }

  private setupWorkerEvents(worker: Worker, name: string) {
    worker.on('completed', (job) => {
      logger.debug(`[${name}] Job ${job.id} completed`);
    });

    worker.on('failed', (job, err) => {
      logger.error(`[${name}] Job ${job?.id} failed:`, err);
    });

    worker.on('error', (err) => {
      logger.error(`[${name}] Worker error:`, err);
    });

    worker.on('progress', (job, progress) => {
      logger.debug(`[${name}] Job ${job.id} progress: ${progress}%`);
    });
  }

  async close() {
    logger.info('Closing all workers...');
    await Promise.all(this.workers.map((worker) => worker.close()));
    logger.info('All workers closed');
  }

  getWorkerStats() {
    return this.workers.map((worker) => ({
      name: worker.name,
      isRunning: worker.isRunning(),
      isPaused: worker.isPaused(),
    }));
  }
}

export const workerManager = new WorkerManager();

// Start workers if running directly
if (import.meta.url === `file://${process.argv[1]}`) {
  workerManager.start();

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down workers...');
    await workerManager.close();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.info('SIGINT received, shutting down workers...');
    await workerManager.close();
    process.exit(0);
  });
}