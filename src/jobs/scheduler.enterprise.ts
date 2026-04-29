import cron from 'node-cron';
import { supabase } from '@/config/supabase.js';
import { logger } from '@/utils/logger.js';
import { env } from '@/config/env.js';
import { queueManager } from '@/queue/QueueManager.js';
import { QUEUE_NAMES } from '@/queue/config.js';

class EnterpriseScheduler {
  /**
   * Start site monitoring scheduler
   * Queues jobs for parallel processing
   */
  startSiteMonitoring() {
    const cronExpression = `*/${env.monitorIntervalMinutes} * * * *`;
    
    logger.info(`Starting monitoring scheduler: every ${env.monitorIntervalMinutes} minutes`);

    cron.schedule(cronExpression, async () => {
      await this.queueSiteMonitoringJobs();
    });

    // Run immediately on startup
    setTimeout(() => this.queueSiteMonitoringJobs(), 5000);
  }

  /**
   * Queue site monitoring jobs for all sites
   * This replaces the blocking for-loop
   */
  private async queueSiteMonitoringJobs() {
    try {
      logger.info('🔄 Queueing site monitoring jobs...');

      // Fetch all sites
      const { data: sites, error } = await supabase
        .from('sites')
        .select('*')
        .returns<{ id: string; name: string; growatt_site_id: string; status: string }[]>();

      if (error) throw error;

      if (!sites || sites.length === 0) {
        logger.info('No sites to monitor');
        return;
      }

      logger.info(`Queueing monitoring jobs for ${sites.length} sites`);

      // Queue a job for each site
      const queuePromises = sites.map((site) =>
        queueManager.addJob(
          QUEUE_NAMES.SITE_MONITORING,
          'monitor-site',
          {
            siteId: site.id,
            siteName: site.name,
            growattSiteId: site.growatt_site_id,
          },
          {
            jobId: `monitor-${site.id}-${Date.now()}`,
            priority: site.status === 'offline' ? 1 : 5, // Prioritize offline sites
          }
        )
      );

      await Promise.all(queuePromises);

      logger.info(`✅ Successfully queued ${sites.length} monitoring jobs`);

      // Log queue metrics
      const metrics = await queueManager.getQueueMetrics(QUEUE_NAMES.SITE_MONITORING);
      logger.info(`Queue status: ${metrics.waiting} waiting, ${metrics.active} active`);
    } catch (error) {
      logger.error('Error queueing site monitoring jobs:', error);
    }
  }

  /**
   * Start site sync scheduler
   */
  startSiteSync() {
    const cronExpression = `0 */${env.syncSitesIntervalHours} * * *`;
    
    logger.info(`Starting site sync scheduler: every ${env.syncSitesIntervalHours} hours`);

    cron.schedule(cronExpression, async () => {
      await queueManager.addJob(QUEUE_NAMES.SITE_SYNC, 'sync-all-sites', {
        timestamp: Date.now(),
      });
    });

    // Run immediately on startup
    setTimeout(async () => {
      await queueManager.addJob(QUEUE_NAMES.SITE_SYNC, 'sync-all-sites', {
        timestamp: Date.now(),
      });
    }, 10000);
  }

  /**
   * Start all schedulers
   */
  startAll() {
    this.startSiteMonitoring();
    this.startSiteSync();
    logger.info('✅ All enterprise schedulers started');
  }
}

export const enterpriseScheduler = new EnterpriseScheduler();