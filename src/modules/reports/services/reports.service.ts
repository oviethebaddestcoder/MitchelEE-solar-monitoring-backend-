import { supabaseAdmin } from '@/config/supabase.js';

interface FieldReport {
  assignment_id: string;
  engineer_id: string;
  report: string;
  findings: string | null;
  images: string[];
  created_at: string;
}

class ReportsService {
  async createReport(data: {
    assignmentId: string;
    engineerId: string;
    report: string;
    findings?: string | null;
    images?: string[];
  }) {
    const { data: result, error } = await supabaseAdmin
      .from('field_reports')
      .insert([{
        assignment_id: data.assignmentId,
        engineer_id:   data.engineerId,
        report:        data.report,
        findings:      data.findings ?? null,
        images:        data.images ?? [],
        created_at:    new Date().toISOString(),
      }])
      .select()
      .single();

    if (error) throw error;
    return result;
  }

  async getReportsByAssignment(assignmentId: string) {
    // FIX: removed profiles:engineer_id join — no FK exists in schema cache.
    // Get engineer profile separately after fetching reports.
    const { data: reports, error } = await supabaseAdmin
      .from('field_reports')
      .select(`
        id,
        engineer_id,
        report,
        findings,
        images,
        created_at,
        engineer_assignments:assignment_id (
          id,
          status,
          assigned_at,
          sites:site_id (
            id,
            name,
            location
          )
        )
      `)
      .eq('assignment_id', assignmentId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    if (!reports?.length) return [];

    // Fetch engineer profiles separately
    const engineerIds = [...new Set(reports.map(r => r.engineer_id).filter(Boolean))];
    const { data: profiles } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, phone')
      .in('id', engineerIds);

    const profileMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p]));

    return reports.map(r => ({
      ...r,
      profiles: profileMap[r.engineer_id] ?? null,
    }));
  }

  async getReportsBySite(siteId: string) {
    // Step 1: get all assignment IDs for this site
    const { data: assignments, error: assignError } = await supabaseAdmin
      .from('engineer_assignments')
      .select('id')
      .eq('site_id', siteId);

    if (assignError) throw assignError;
    if (!assignments?.length) return [];

    const assignmentIds = assignments.map(a => a.id);

    // Step 2: fetch reports (no profiles:engineer_id join — no FK in schema)
    const { data: reports, error } = await supabaseAdmin
      .from('field_reports')
      .select(`
        id,
        engineer_id,
        report,
        findings,
        images,
        created_at,
        engineer_assignments:assignment_id (
          id,
          status,
          assigned_at,
          sites:site_id (
            id,
            name,
            location
          )
        )
      `)
      .in('assignment_id', assignmentIds)
      .order('created_at', { ascending: false });

    if (error) throw error;
    if (!reports?.length) return [];

    // Step 3: fetch engineer profiles separately
    const engineerIds = [...new Set(reports.map(r => r.engineer_id).filter(Boolean))];
    const { data: profiles } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, phone')
      .in('id', engineerIds);

    const profileMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p]));

    return reports.map(r => ({
      ...r,
      profiles: profileMap[r.engineer_id] ?? null,
    }));
  }
}

export const reportsService = new ReportsService();