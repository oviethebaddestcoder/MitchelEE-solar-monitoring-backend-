import { supabaseAdmin } from '@/config/supabase.js';
import { growattService } from '@/integrations/growatt/growatt.service.js';
import { logger } from '@/utils/logger.js';

// ─── Thresholds ───────────────────────────────────────────────────────────────

const T = {
  LOW_POWER_PCT:     20,  // warn if pac < 20% of nominal during daylight
  DAYLIGHT_START:     7,  // 7am
  DAYLIGHT_END:      18,  // 6pm
  NO_GEN_AFTER_HOUR: 10,  // fire "no generation" alert after 10am
  BATTERY_LOW:       20,  // %
  BATTERY_CRITICAL:  10,  // %
  TEMP_WARNING:      65,  // °C
  TEMP_CRITICAL:     80,  // °C
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface SiteRow {
  id:              string;
  name:            string;
  growatt_site_id: string;
  status:          string;
  last_online_at:  string | null;
}

interface PollMetrics {
  pac:          number;
  eToday:       number;
  eTotal:       number;
  nominalPower: number;
  battery:      number | null;
  temperature:  number | null;
  status:       'online' | 'offline' | 'warning';
  isDaylight:   boolean;
  currentHour:  number;
}

interface AlertCandidate {
  metric_key: string;
  severity:   'warning' | 'critical';
  message:    string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

class MonitoringService {
  private isRunning  = false;
  private intervalId: NodeJS.Timeout | null = null;

  start(intervalMinutes = 5): void {
    if (this.isRunning) return;
    this.isRunning = true;
    logger.info(`🔄 Monitoring started — polling every ${intervalMinutes} minutes`);
    void this.runCycle();
    this.intervalId = setInterval(() => void this.runCycle(), intervalMinutes * 60 * 1000);
  }

  stop(): void {
    if (this.intervalId) clearInterval(this.intervalId);
    this.isRunning = false;
    logger.info('⏹ Monitoring stopped');
  }

  // ── Main cycle ──────────────────────────────────────────────────────────────

  async runCycle(): Promise<void> {
    try {
      logger.info('📡 Starting monitoring cycle...');

      const { data: sites, error } = await supabaseAdmin
        .from('sites')
        .select('id, name, growatt_site_id, status, last_online_at')
        .not('growatt_site_id', 'is', null);

      if (error) {
        logger.error('❌ Failed to fetch sites from DB:', JSON.stringify(error));
        return;
      }

      if (!sites?.length) {
        logger.warn('No sites to monitor');
        return;
      }

      await Promise.allSettled(sites.map(site => this.pollSite(site as SiteRow)));
      logger.info(`✅ Monitoring cycle complete — ${sites.length} sites polled`);
    } catch (err) {
      logger.error('❌ Monitoring cycle crashed:', err instanceof Error ? err.stack : String(err));
    }
  }

  // ── Poll single site ────────────────────────────────────────────────────────

  private async pollSite(site: SiteRow): Promise<void> {
    try {
      const plantId     = site.growatt_site_id;
      const currentHour = new Date().getHours();
      const isDaylight  = currentHour >= T.DAYLIGHT_START && currentHour <= T.DAYLIGHT_END;

      // 1. Real-time energy from plant-level endpoint
      const energy = await growattService.getPlantEnergyData(plantId);

      // 2. Static detail for nominalPower + location
      const detail       = await growattService.getPlantDetail(plantId);
      const nominalPower = parseFloat(String(detail?.['nominalPower'] ?? '0')) || 0;
      const eTotal       = energy.eTotal || parseFloat(String(detail?.['eTotal'] ?? '0'));

      // 3. Determine site status
      //    online  = actively producing power
      //    warning = producing but below 20% of nominal during daylight
      //    offline = zero output (regardless of time of day)
      let newStatus: 'online' | 'offline' | 'warning' = 'offline';
      if (energy.pac > 0) {
        const efficiency = nominalPower > 0 ? (energy.pac / nominalPower) * 100 : 100;
        newStatus = isDaylight && efficiency < T.LOW_POWER_PCT ? 'warning' : 'online';
      }
      // pac === 0 stays 'offline' — no special casing for daylight

      // 4. Persist metric snapshot
      const { error: metricErr } = await supabaseAdmin.from('site_metrics').insert({
        site_id:     site.id,
        power:       Math.round(energy.pac),
        e_today:     energy.eToday,
        e_total:     eTotal,
        e_month:     energy.eMonth,
        battery:     null,
        temperature: null,
        recorded_at: new Date().toISOString(),
      });

      if (metricErr) {
        logger.warn(`⚠️  Metric insert failed for ${site.name}: ${JSON.stringify(metricErr)}`);
      }

      // 5. Update site record
      const updates: Record<string, unknown> = {
        status:     newStatus,
        updated_at: new Date().toISOString(),
      };
      if (newStatus === 'online') updates['last_online_at'] = new Date().toISOString();
      if (detail?.['city'])       updates['location']       = detail['city'];

      await supabaseAdmin.from('sites').update(updates).eq('id', site.id);

      // 6. Evaluate alerts
      const metrics: PollMetrics = {
        pac:         energy.pac,
        eToday:      energy.eToday,
        eTotal,
        nominalPower,
        battery:     null,
        temperature: null,
        status:      newStatus,
        isDaylight,
        currentHour,
      };

      await this.evaluateAlerts(site, metrics);

      logger.info(
        `✅ ${site.name}: pac=${energy.pac}W eToday=${energy.eToday}kWh ` +
        `eTotal=${eTotal}kWh status=${newStatus}`
      );
    } catch (err) {
      const detail = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
      logger.error(`❌ Failed to poll site ${site.name}:\n${detail}`);

      await supabaseAdmin
        .from('sites')
        .update({ status: 'offline', updated_at: new Date().toISOString() })
        .eq('id', site.id);
    }
  }

  // ── Alert evaluation ────────────────────────────────────────────────────────

  private async evaluateAlerts(site: SiteRow, m: PollMetrics): Promise<void> {
    const candidates: AlertCandidate[] = [];

    // Zero output during daylight after ramp-up hour
    if (m.isDaylight && m.currentHour >= T.NO_GEN_AFTER_HOUR && m.pac === 0) {
      candidates.push({
        metric_key: 'zero_power',
        severity:   'critical',
        message:    `${site.name} has zero power output during daylight hours`,
      });
    }

    // Low output (pac > 0 but below threshold — not zero, that's handled above)
    if (
      m.isDaylight &&
      m.pac > 0 &&
      m.nominalPower > 0 &&
      m.pac < (m.nominalPower * T.LOW_POWER_PCT) / 100
    ) {
      candidates.push({
        metric_key: 'low_power',
        severity:   'warning',
        message:
          `${site.name} output is low — ` +
          `${m.pac}W vs ${m.nominalPower}W nominal ` +
          `(${Math.round((m.pac / m.nominalPower) * 100)}%)`,
      });
    }

    // No generation recorded today
    if (m.isDaylight && m.currentHour >= T.NO_GEN_AFTER_HOUR && m.eToday === 0) {
      candidates.push({
        metric_key: 'no_generation_today',
        severity:   'critical',
        message:    `${site.name} has recorded 0 kWh today`,
      });
    }

    // Site offline during daylight
    if (m.status === 'offline' && m.isDaylight) {
      candidates.push({
        metric_key: 'site_offline',
        severity:   'critical',
        message:    `${site.name} is offline during operational hours`,
      });
    }

    // Battery alerts (when available)
    if (m.battery !== null) {
      if (m.battery <= T.BATTERY_CRITICAL) {
        candidates.push({
          metric_key: 'battery_critical',
          severity:   'critical',
          message:    `${site.name} battery critically low (${m.battery}%)`,
        });
      } else if (m.battery <= T.BATTERY_LOW) {
        candidates.push({
          metric_key: 'battery_low',
          severity:   'warning',
          message:    `${site.name} battery low (${m.battery}%)`,
        });
      }
    }

    // Temperature alerts (when available)
    if (m.temperature !== null) {
      if (m.temperature >= T.TEMP_CRITICAL) {
        candidates.push({
          metric_key: 'temp_critical',
          severity:   'critical',
          message:    `${site.name} inverter temperature critical (${m.temperature}°C)`,
        });
      } else if (m.temperature >= T.TEMP_WARNING) {
        candidates.push({
          metric_key: 'temp_warning',
          severity:   'warning',
          message:    `${site.name} inverter temperature high (${m.temperature}°C)`,
        });
      }
    }

    // Insert new alerts — skip duplicates
    for (const alert of candidates) {
      const { data: existing } = await supabaseAdmin
        .from('alerts')
        .select('id')
        .eq('site_id',      site.id)
        .eq('metric_key',   alert.metric_key)
        .eq('acknowledged', false)
        .maybeSingle();

      if (!existing) {
        const { error } = await supabaseAdmin.from('alerts').insert({
          site_id:      site.id,
          message:      alert.message,
          severity:     alert.severity,
          metric_key:   alert.metric_key,
          acknowledged: false,
          created_at:   new Date().toISOString(),
        });
        if (error) {
          logger.warn(`⚠️  Alert insert failed (${alert.metric_key}): ${JSON.stringify(error)}`);
        } else {
          logger.warn(`🚨 [${alert.severity.toUpperCase()}] ${alert.message}`);
        }
      }
    }

    await this.autoResolveAlerts(site, m, candidates);
  }

  // ── Auto-resolve ────────────────────────────────────────────────────────────

  private async autoResolveAlerts(
    site:   SiteRow,
    m:      PollMetrics,
    active: AlertCandidate[],
  ): Promise<void> {
    const activeKeys = new Set(active.map(a => a.metric_key));
    const toResolve: string[] = [];

    if (!activeKeys.has('zero_power')          && m.pac > 0)                                         toResolve.push('zero_power');
    if (!activeKeys.has('no_generation_today') && m.eToday > 0)                                      toResolve.push('no_generation_today');
    if (!activeKeys.has('low_power')           && m.nominalPower > 0
                                               && m.pac >= (m.nominalPower * T.LOW_POWER_PCT) / 100) toResolve.push('low_power');
    if (!activeKeys.has('site_offline')        && m.status === 'online')                             toResolve.push('site_offline');

    if (m.battery !== null) {
      if (!activeKeys.has('battery_low')      && m.battery > T.BATTERY_LOW)      toResolve.push('battery_low');
      if (!activeKeys.has('battery_critical') && m.battery > T.BATTERY_CRITICAL) toResolve.push('battery_critical');
    }
    if (m.temperature !== null) {
      if (!activeKeys.has('temp_warning')  && m.temperature < T.TEMP_WARNING)  toResolve.push('temp_warning');
      if (!activeKeys.has('temp_critical') && m.temperature < T.TEMP_CRITICAL) toResolve.push('temp_critical');
    }

    if (!toResolve.length) return;

    const { error } = await supabaseAdmin
      .from('alerts')
      .update({ acknowledged: true, acknowledged_at: new Date().toISOString() })
      .eq('site_id', site.id)
      .in('metric_key', toResolve)
      .eq('acknowledged', false);

    if (error) {
      logger.warn(`⚠️  Auto-resolve failed for ${site.name}: ${JSON.stringify(error)}`);
    } else {
      logger.info(`✅ Auto-resolved: ${toResolve.join(', ')} for ${site.name}`);
    }
  }
}

export const monitoringService = new MonitoringService();