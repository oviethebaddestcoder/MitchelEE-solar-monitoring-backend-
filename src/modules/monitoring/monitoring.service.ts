 
import { supabaseAdmin } from '@/config/supabase.js';
import { growattService } from '@/integrations/growatt/growatt.service.js';
import { logger } from '@/utils/logger.js';
 
// ─── Thresholds for alert generation ─────────────────────────────────────────
const THRESHOLDS = {
  // Power drops below this % of nominal = warning
  LOW_POWER_PERCENT:    20,
  // No power at all during daylight hours = critical
  ZERO_POWER_HOURS:     { start: 7, end: 18 }, // 7am–6pm
  // Battery below these levels
  BATTERY_LOW:          20,  // warning
  BATTERY_CRITICAL:     10,  // critical
  // Temperature above these (°C)
  TEMP_WARNING:         65,
  TEMP_CRITICAL:        80,
  // Site offline for this many minutes = critical
  OFFLINE_MINUTES:      15,
};
 
interface SiteRow {
  id: string;
  name: string;
  growatt_site_id: string;
  status: string;
  last_online_at: string | null;
}
 
class MonitoringService {
  private isRunning = false;
  private intervalId: NodeJS.Timeout | null = null;
 
  // ── Start polling loop ──────────────────────────────────────────────────────
  start(intervalMinutes = 5) {
    if (this.isRunning) return;
    this.isRunning = true;
    logger.info(`🔄 Monitoring started — polling every ${intervalMinutes} minutes`);
    // Run immediately then on interval
    this.runCycle();
    this.intervalId = setInterval(() => this.runCycle(), intervalMinutes * 60 * 1000);
  }
 
  stop() {
    if (this.intervalId) clearInterval(this.intervalId);
    this.isRunning = false;
    logger.info('⏹ Monitoring stopped');
  }
 
  // ── Main poll cycle ─────────────────────────────────────────────────────────
  async runCycle() {
    try {
      logger.info('📡 Starting monitoring cycle...');
 
      const { data: sites, error } = await supabaseAdmin
        .from('sites')
        .select('id, name, growatt_site_id, status, last_online_at')
        .not('growatt_site_id', 'is', null);
 
      if (error || !sites?.length) {
        logger.warn('No sites to monitor');
        return;
      }
 
      await Promise.allSettled(sites.map(site => this.pollSite(site)));
      logger.info(`✅ Monitoring cycle complete — ${sites.length} sites polled`);
    } catch (err) {
      logger.error('❌ Monitoring cycle failed:', err);
    }
  }
 
  // ── Poll a single site ──────────────────────────────────────────────────────
  private async pollSite(site: SiteRow) {
    try {
      const plantId = site.growatt_site_id;
 
      // 1. Get plant detail (city, capacity, eTotal)
      const detail = await growattService.getPlantDetail(plantId);
 
      // 2. Get devices and their real-time data
      const devices = await growattService.getDeviceList(plantId);
 
      let totalPac   = 0;
      let totalVac   = 230;
      let minSoc:    number | null = null;
      let maxTemp:   number | null = null;
      let anyOnline  = false;
 
      // 3. For each storage device, get real-time metrics
      for (const device of devices) {
        if (device.deviceType === 'storage' || device.deviceType === 'mix') {
          const liveData = await growattService.getStorageData(device.serialNum, plantId);
          totalPac += liveData.pac;
          totalVac  = liveData.vac || totalVac;
          if (liveData.soc !== null) {
            minSoc = minSoc === null ? liveData.soc : Math.min(minSoc, liveData.soc);
          }
          if (liveData.pac > 0) anyOnline = true;
        }
      }
 
      // 4. Determine site status
      const nominalPower  = parseFloat(detail?.nominalPower || '0');
      const eTotal        = parseFloat(detail?.eTotal || '0');
      const currentHour   = new Date().getHours();
      const isDaylight    = currentHour >= THRESHOLDS.ZERO_POWER_HOURS.start &&
                            currentHour <= THRESHOLDS.ZERO_POWER_HOURS.end;
 
      let newStatus: 'online' | 'offline' | 'warning' = 'offline';
      if (anyOnline || totalPac > 0) {
        newStatus = 'online';
      } else if (!isDaylight) {
        // Night time — offline is expected, don't alarm
        newStatus = 'offline';
      }
 
      // 5. Store metric in site_metrics
      const { error: metricError } = await supabaseAdmin
        .from('site_metrics')
        .insert({
          site_id:     site.id,
          power:       Math.round(totalPac),
          voltage:     Math.round(totalVac),
          battery:     minSoc !== null ? Math.round(minSoc) : null,
          temperature: maxTemp,
          e_total:     eTotal,
          recorded_at: new Date().toISOString(),
        });
 
      if (metricError) {
        logger.error(`❌ Failed to store metric for ${site.name}:`, metricError.message);
      }
 
      // 6. Update site status + last_online_at
      const updates: any = { status: newStatus, updated_at: new Date().toISOString() };
      if (newStatus === 'online') updates.last_online_at = new Date().toISOString();
      if (detail?.city)         updates.location = detail.city;
 
      await supabaseAdmin.from('sites').update(updates).eq('id', site.id);
 
      // 7. Generate alerts based on metrics
      await this.evaluateAlerts(site, {
        power:        totalPac,
        nominalPower,
        battery:      minSoc,
        temperature:  maxTemp,
        status:       newStatus,
        isDaylight,
      });
 
      logger.info(`✅ ${site.name}: power=${totalPac}W status=${newStatus} battery=${minSoc ?? '-'}% eTotal=${eTotal}kWh`);
    } catch (err: any) {
      logger.error(`❌ Failed to poll site ${site.name}:`, err.message);
      // Mark site as offline if polling fails
      await supabaseAdmin
        .from('sites')
        .update({ status: 'offline', updated_at: new Date().toISOString() })
        .eq('id', site.id);
    }
  }
 
  // ── Alert evaluation ────────────────────────────────────────────────────────
  private async evaluateAlerts(
    site: SiteRow,
    metrics: {
      power:        number;
      nominalPower: number;
      battery:      number | null;
      temperature:  number | null;
      status:       string;
      isDaylight:   boolean;
    }
  ) {
    const alerts: { message: string; severity: 'warning' | 'critical'; metric_key: string }[] = [];
 
    // Zero power during daylight
    if (metrics.isDaylight && metrics.power === 0) {
      alerts.push({
        message:    `${site.name} has zero power output during daylight hours`,
        severity:   'critical',
        metric_key: 'zero_power',
      });
    }
    // Low power (less than threshold % of nominal)
    else if (
      metrics.nominalPower > 0 &&
      metrics.isDaylight &&
      metrics.power > 0 &&
      metrics.power < (metrics.nominalPower * THRESHOLDS.LOW_POWER_PERCENT) / 100
    ) {
      alerts.push({
        message:    `${site.name} power output is very low (${metrics.power}W / ${metrics.nominalPower}W nominal)`,
        severity:   'warning',
        metric_key: 'low_power',
      });
    }
 
    // Battery alerts
    if (metrics.battery !== null) {
      if (metrics.battery <= THRESHOLDS.BATTERY_CRITICAL) {
        alerts.push({
          message:    `${site.name} battery critically low (${metrics.battery}%)`,
          severity:   'critical',
          metric_key: 'battery_critical',
        });
      } else if (metrics.battery <= THRESHOLDS.BATTERY_LOW) {
        alerts.push({
          message:    `${site.name} battery low (${metrics.battery}%)`,
          severity:   'warning',
          metric_key: 'battery_low',
        });
      }
    }
 
    // Temperature alerts
    if (metrics.temperature !== null) {
      if (metrics.temperature >= THRESHOLDS.TEMP_CRITICAL) {
        alerts.push({
          message:    `${site.name} inverter temperature critical (${metrics.temperature}°C)`,
          severity:   'critical',
          metric_key: 'temp_critical',
        });
      } else if (metrics.temperature >= THRESHOLDS.TEMP_WARNING) {
        alerts.push({
          message:    `${site.name} inverter temperature high (${metrics.temperature}°C)`,
          severity:   'warning',
          metric_key: 'temp_warning',
        });
      }
    }
 
    // Site offline during daylight
    if (metrics.status === 'offline' && metrics.isDaylight) {
      alerts.push({
        message:    `${site.name} is offline during operational hours`,
        severity:   'critical',
        metric_key: 'site_offline',
      });
    }
 
    // Insert alerts — deduplicate by checking for existing unacknowledged alert of same type
    for (const alert of alerts) {
      const { data: existing } = await supabaseAdmin
        .from('alerts')
        .select('id')
        .eq('site_id', site.id)
        .eq('metric_key', alert.metric_key)
        .eq('acknowledged', false)
        .single();
 
      if (!existing) {
        await supabaseAdmin.from('alerts').insert({
          site_id:     site.id,
          message:     alert.message,
          severity:    alert.severity,
          metric_key:  alert.metric_key,
          acknowledged: false,
          created_at:  new Date().toISOString(),
        });
        logger.warn(`🚨 Alert created: [${alert.severity}] ${alert.message}`);
      }
 
      // Auto-resolve alerts that are no longer triggered
      // e.g. if power is now fine, resolve any existing low_power alert
    }
 
    // Auto-resolve alerts whose condition is no longer true
    await this.autoResolveAlerts(site, metrics);
  }
 
  // ── Auto-resolve alerts when condition clears ───────────────────────────────
  private async autoResolveAlerts(
    site: SiteRow,
    metrics: { power: number; battery: number | null; temperature: number | null; status: string; isDaylight: boolean }
  ) {
    const toResolve: string[] = [];
 
    if (metrics.power > 0)                                            toResolve.push('zero_power');
    if (metrics.power >= 0)                                           toResolve.push('low_power');  // re-evaluated above
    if (metrics.battery !== null && metrics.battery > THRESHOLDS.BATTERY_LOW)   toResolve.push('battery_low', 'battery_critical');
    if (metrics.temperature !== null && metrics.temperature < THRESHOLDS.TEMP_WARNING) toResolve.push('temp_warning', 'temp_critical');
    if (metrics.status === 'online')                                  toResolve.push('site_offline');
 
    if (toResolve.length) {
      await supabaseAdmin
        .from('alerts')
        .update<{ acknowledged: boolean; acknowledged_at: string }>({
          acknowledged: true,
          acknowledged_at: new Date().toISOString(),
        })
        .eq('site_id', site.id)
        .in('metric_key', toResolve)
        .eq('acknowledged', false);
    }
  }
}
 
export const monitoringService = new MonitoringService();