import { Job } from 'bullmq';
import { supabaseAdmin } from '@/config/supabase.js';
import { logger } from '@/utils/logger.js';
import { enhancedGrowattService } from '@/integrations/growatt/growatt.service.enhanced.js';

import { env } from '@/config/env.js';
import { queueManager } from '@/queue/QueueManager.js';

interface SiteMonitoringJob {
  siteId: string;
  growattSiteId: string;
  siteName: string;
}

export async function processSiteMonitoring(job: Job<SiteMonitoringJob>): Promise<void> {
  const { siteId, growattSiteId, siteName } = job.data;

  try {
    logger.info(`🔍 Monitoring site: ${siteName} (${growattSiteId})`);

    // Get previous status from database
    const { data: currentSite } = await supabaseAdmin
      .from('sites')
      .select('status, last_online_at')
      .eq('id', siteId)
      .single();

    const previousStatus = currentSite?.status || 'unknown';

    // Fetch real-time data from Growatt
    const plantData = await enhancedGrowattService.getPlantData(growattSiteId);
    
    logger.info(`📊 ${siteName}: Power=${plantData.pac}W, Voltage=${plantData.vac1}V, Battery=${plantData.batteryPercentage}%, Temp=${plantData.temperature}°C`);

    // Determine new site status
    let newStatus: 'online' | 'offline' | 'warning' = 'offline';
    
    if (plantData.pac > 100) {
      newStatus = 'online';
    } else if (plantData.pac > 0) {
      newStatus = 'warning';
    }

    // Check for critical conditions
    const hasHighTemp = plantData.temperature && plantData.temperature > Number(env.TEMPERATURE_HIGH_THRESHOLD);
    const hasLowBattery = plantData.batteryPercentage && plantData.batteryPercentage < Number(env.BATTERY_LOW_THRESHOLD);
    const hasVoltageIssue = plantData.vac1 < 200 || plantData.vac1 > 250;

    if (hasHighTemp || hasLowBattery || hasVoltageIssue) {
      if (newStatus === 'online') {
        newStatus = 'warning';
      }
    }

    // DETECT STATUS CHANGE
    const statusChanged = previousStatus !== newStatus;
    const wentOffline = previousStatus === 'online' && newStatus === 'offline';
    const wentWarning = previousStatus === 'online' && newStatus === 'warning';
    const recovered = (previousStatus === 'offline' || previousStatus === 'warning') && newStatus === 'online';

    if (statusChanged) {
      logger.warn(`⚠️ STATUS CHANGE DETECTED: ${siteName} went from ${previousStatus} → ${newStatus}`);
    }

    // Save metrics to database
    const { error: metricsError } = await supabaseAdmin
      .from('site_metrics')
      .insert({
        site_id: siteId,
        power: plantData.pac,
        voltage: plantData.vac1,
        battery: plantData.batteryPercentage,
        temperature: plantData.temperature,
        recorded_at: new Date().toISOString(),
      });

    if (metricsError) {
      logger.error(`Failed to save metrics for ${siteName}:`, metricsError);
    } else {
      logger.info(`✅ Saved metrics for ${siteName}`);
    }

    // Update site status
    const { error: statusError } = await supabaseAdmin
      .from('sites')
      .update({
        status: newStatus,
        last_online_at: newStatus === 'online' ? new Date().toISOString() : currentSite?.last_online_at,
        updated_at: new Date().toISOString(),
      })
      .eq('id', siteId);

    if (statusError) {
      logger.error(`Failed to update status for ${siteName}:`, statusError);
    } else {
      logger.info(`✅ Updated ${siteName} status to: ${newStatus}`);
    }

    // CREATE ALERTS AND SEND EMAILS
    if (wentOffline) {
      await createAlert(siteId, siteName, 'critical', `Site ${siteName} went OFFLINE`, true);
    } else if (wentWarning) {
      await createAlert(siteId, siteName, 'warning', `Site ${siteName} has warnings`, true);
    } else if (recovered) {
      logger.info(`✅ ${siteName} RECOVERED and is now online!`);
      // Optionally send recovery email
      await createAlert(siteId, siteName, 'info', `Site ${siteName} is back online`, true);
    }

    // Check for other critical conditions
    if (hasHighTemp) {
      await createAlert(siteId, siteName, 'critical', `High temperature detected: ${plantData.temperature}°C`, true);
    }
    
    if (hasLowBattery) {
      await createAlert(siteId, siteName, 'warning', `Low battery: ${plantData.batteryPercentage}%`, false);
    }
    
    if (hasVoltageIssue) {
      await createAlert(siteId, siteName, 'warning', `Voltage out of range: ${plantData.vac1}V`, false);
    }

  } catch (error) {
    logger.error(`❌ Failed to monitor site ${siteName}:`, error);
    
    // Mark site as offline if monitoring fails
    await supabaseAdmin
      .from('sites')
      .update({
        status: 'offline',
        updated_at: new Date().toISOString(),
      })
      .eq('id', siteId);

    // Create alert for monitoring failure
    await createAlert(siteId, siteName, 'critical', `Failed to monitor site ${siteName}: ${error}`, true);
    
    throw error;
  }
}

async function createAlert(
  siteId: string, 
  siteName: string, 
  severity: 'critical' | 'warning' | 'info', 
  message: string, 
  sendEmail: boolean
) {
  try {
    // Check if similar alert already exists (within last hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    
    const { data: existingAlert } = await supabaseAdmin
      .from('alerts')
      .select('id')
      .eq('site_id', siteId)
      .eq('message', message)
      .eq('acknowledged', false)
      .gte('created_at', oneHourAgo)
      .maybeSingle();

    if (existingAlert) {
      logger.debug('Alert already exists, skipping');
      return;
    }

    // Create new alert
    const { error } = await supabaseAdmin
      .from('alerts')
      .insert({
        site_id: siteId,
        severity,
        message,
        acknowledged: false,
        created_at: new Date().toISOString(),
      });

    if (error) {
      logger.error('Failed to create alert:', error);
      return;
    }

    logger.info(`🚨 Created ${severity} alert: ${message}`);
    
    // Queue email notification for admins
    if (sendEmail) {
      await queueManager.addJob('email-notification', `alert-${siteId}-${Date.now()}`, {
        siteId,
        siteName,
        message,
        severity,
      });
      logger.info(`📧 Queued email notification for: ${message}`);
    }
  } catch (error) {
    logger.error('Error creating alert:', error);
  }
}