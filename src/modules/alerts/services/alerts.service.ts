import { supabaseAdmin } from '@/config/supabase.js';
import { NotFoundError } from '@/utils/errorHandler.js';

class AlertsService {
  async getAlerts(filters?: { severity?: string; acknowledged?: boolean }) {
    let query = supabaseAdmin
      .from('alerts')
      .select('*, sites(name, location)')
      .order('created_at', { ascending: false });

    if (filters?.severity) {
      query = query.eq('severity', filters.severity);
    }
    if (filters?.acknowledged !== undefined) {
      query = query.eq('acknowledged', filters.acknowledged);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data;
  }

  async getCriticalAlerts() {
    // Returns ALL unacknowledged alerts so admin sees everything
    const { data, error } = await supabaseAdmin
      .from('alerts')
      .select('*, sites(name, location)')
      .eq('acknowledged', false)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }

  async acknowledgeAlert(alertId: string, userId: string) {
    const { data, error } = await supabaseAdmin
      .from('alerts')
      .update({
        acknowledged:    true,
        acknowledged_by: userId,
        acknowledged_at: new Date().toISOString(),
      })
      .eq('id', alertId)
      .select()
      .single();

    if (error || !data) throw new NotFoundError('Alert not found');
    return data;
  }

  async getAlertsBySite(siteId: string) {
    const { data, error } = await supabaseAdmin
      .from('alerts')
      .select('*, sites(name, location)')
      .eq('site_id', siteId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    return data;
  }
}

export const alertsService = new AlertsService();