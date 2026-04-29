import { supabaseAdmin } from '@/config/supabase.js';
import { NotFoundError } from '@/utils/errorHandler.js';

class EngineersService {
  async getAllEngineers() {
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('*')
      // FIX: was 'ENGINEER' — roles are stored lowercase after auth normalization fix
      .eq('role', 'ENGINEER')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }

  async assignEngineer(engineerId: string, siteId: string, alertId?: string) {
    // Guard: never insert a null engineer_id
    if (!engineerId) throw new Error('engineerId is required');
    if (!siteId) throw new Error('siteId is required');

    const { data, error } = await supabaseAdmin
      .from('engineer_assignments')
      .insert({
        engineer_id: engineerId,
        site_id: siteId,
        alert_id: alertId || null,
        status: 'pending',
        assigned_at: new Date().toISOString(),
      })
      .select('*, sites(name)')
      .single();

    if (error) throw error;

    // Fetch engineer profile separately (no direct FK on profiles)
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('full_name, phone')
      .eq('id', engineerId)
      .single();

    return { ...data, engineer_profile: profile };
  }

  async getMyAssignments(engineerId: string) {
    const { data, error } = await supabaseAdmin
      .from('engineer_assignments')
      .select(`
        id,
        engineer_id,
        site_id,
        alert_id,
        status,
        assigned_at,
        resolved_at,
        sites:site_id (
          id,
          name,
          location,
          status
        ),
        alerts:alert_id (
          id,
          message,
          severity
        )
      `)
      .eq('engineer_id', engineerId)
      .order('assigned_at', { ascending: false });

    if (error) throw error;
    return data ?? [];
  }

  async getAllAssignments() {
    const { data, error } = await supabaseAdmin
      .from('engineer_assignments')
      .select(`
        id,
        engineer_id,
        site_id,
        alert_id,
        status,
        assigned_at,
        resolved_at,
        sites:site_id (
          id,
          name,
          location,
          status
        ),
        alerts:alert_id (
          id,
          message,
          severity
        )
      `)
      .order('assigned_at', { ascending: false });

    if (error) throw error;
    return data ?? [];
  }

  async updateAssignmentStatus(assignmentId: string, status: string) {
    const updates: Record<string, string> = { status };

    if (status === 'resolved') {
      updates.resolved_at = new Date().toISOString();
    }

    const { data, error } = await supabaseAdmin
      .from('engineer_assignments')
      .update(updates)
      .eq('id', assignmentId)
      .select()
      .single();

    if (error || !data) {
      throw new NotFoundError('Assignment not found');
    }

    return data;
  }
}

export const engineersService = new EngineersService();