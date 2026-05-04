import { supabaseAdmin } from '@/config/supabase.js';
import { NotFoundError } from '@/utils/errorHandler.js';

class SitesService {
  async getAllSites() {
    const { data, error } = await supabaseAdmin
      .from('sites')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }

  async getSiteById(id: string) {
    const { data, error } = await supabaseAdmin
      .from('sites')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      throw new NotFoundError('Site not found');
    }

    return data;
  }

  async getSiteMetrics(siteId: string, limit: number = 100) {
    const { data, error } = await supabaseAdmin
      .from('site_metrics')
      .select('*')
      .eq('site_id', siteId)
      .order('recorded_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data;
  }

  async getSiteInverters(siteId: string) {
    const { data, error } = await supabaseAdmin
      .from('inverters')
      .select('*')
      .eq('site_id', siteId);

    if (error) throw error;
    return data;
  }
async getPublicOverview() {
  // Get all sites with their Growatt IDs
  const { data: sites, error: sitesError } = await supabaseAdmin
    .from('sites')
    .select('id, name, location, status, last_online_at, growatt_site_id')
    .order('created_at', { ascending: false });

  if (sitesError) throw sitesError;

  // Get recent metrics for all sites (last 24 hours)
  const last24Hours = new Date();
  last24Hours.setHours(last24Hours.getHours() - 24);

  const { data: metrics, error: metricsError } = await supabaseAdmin
    .from('site_metrics')
    .select('site_id, power, voltage, battery, temperature, recorded_at')
    .gte('recorded_at', last24Hours.toISOString())
    .order('recorded_at', { ascending: true });

  if (metricsError) throw metricsError;

  // Get inverter count for each site
  const { data: inverters, error: invertersError } = await supabaseAdmin
    .from('inverters')
    .select('id, site_id, serial, capacity, status');

  if (invertersError) throw invertersError;

  // Calculate statistics
  const totalSites = sites?.length || 0;
  const onlineSites = sites?.filter(s => s.status === 'online').length || 0;
  const offlineSites = sites?.filter(s => s.status === 'offline').length || 0;
  const warningSites = sites?.filter(s => s.status === 'warning').length || 0;

  // Calculate total power generation (from last 5 minutes)
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const recentMetrics = metrics?.filter(m => m.recorded_at && m.recorded_at >= fiveMinutesAgo) || [];
  
  const currentPower = recentMetrics.reduce((sum, m) => {
    // Group by site to avoid double counting
    const siteMetrics = recentMetrics.filter(rm => rm.site_id === m.site_id);
    const latestSiteMetric = siteMetrics[siteMetrics.length - 1];
    return m === latestSiteMetric ? sum + (m.power || 0) : sum;
  }, 0);

  // Group metrics by site for detailed view
  const siteMetrics = sites?.map(site => {
    const siteData = metrics?.filter(m => m.site_id === site.id) || [];
    const siteInverters = inverters?.filter(i => i.site_id === site.id) || [];
    
    // Get latest metric
    const latestMetric = siteData[siteData.length - 1];

    return {
      id: site.id,
      name: site.name,
      location: site.location,
      status: site.status,
      last_online_at: site.last_online_at,
      growatt_site_id: site.growatt_site_id,
      inverter_count: siteInverters.length,
      total_capacity: siteInverters.reduce((sum, inv) => sum + (inv.capacity || 0), 0),
      metrics: siteData,
      latest_metric: latestMetric ? {
        power: latestMetric.power,
        voltage: latestMetric.voltage,
        battery: latestMetric.battery,
        temperature: latestMetric.temperature,
        recorded_at: latestMetric.recorded_at,
      } : null,
    };
  }) || [];

  return {
    summary: {
      totalSites,
      onlineSites,
      offlineSites,
      warningSites,
      currentPower: Math.round(currentPower),
      lastUpdated: new Date().toISOString(),
    },
    sites: siteMetrics,
    recentMetrics: metrics || [],
  };
}
}

export const sitesService = new SitesService();