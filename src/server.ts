import app from './app.js';
import { env } from '@/config/env.js';
import { logger } from '@/utils/logger.js';
import { startAllJobs } from '@/jobs/index.js';
import { workerManager } from '@/workers/index.js';
import { queueManager } from '@/queue/QueueManager.js';
import { redisConnection } from '@/queue/config.js';
import { monitoringService } from "@/modules/monitoring/monitoring.service.js";


// Start server
const server = app.listen(env.port, () => {
  logger.info(`
  
     SOLAR INVERTER MONITORING PLATFORM - ENTERPRISE   
                                                         
    Server: http://localhost:${env.port}                    
    Environment: ${env.NODE_ENV}                       
  API Version: ${env.API_VERSION}                         
   Worker Concurrency: ${env.WORKER_CONCURRENCY}                  
   Redis: ${env.REDIS_HOST}:${env.REDIS_PORT}        
  `);
});


 
// Start background services
async function startBackgroundServices() {
  try {
    logger.info('Starting worker pool...');
    workerManager.start();

    logger.info('Starting job schedulers...');
    startAllJobs();

    logger.info('✅ All background services started');
  } catch (error) {
    logger.error('Failed to start background services:', error);
    process.exit(1);
  }
}

startBackgroundServices();

 monitoringService.start(5);

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  logger.info(`${signal} received. Shutting down gracefully...`);

  server.close(async () => {
    logger.info('HTTP server closed');

    try {
      await workerManager.close();
      await queueManager.closeAll();
      await redisConnection.quit();
      
      logger.info('Graceful shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown:', error);
      process.exit(1);
    }
  });

  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));