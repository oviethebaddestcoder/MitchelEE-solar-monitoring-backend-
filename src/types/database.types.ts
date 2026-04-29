export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string;
          phone: string | null;
          role: 'ADMIN' | 'ENGINEER';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name: string;
          phone?: string | null;
          role: 'ADMIN' | 'ENGINEER';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string;
          phone?: string | null;
          role?: 'ADMIN' | 'ENGINEER';
          updated_at?: string;
        };
      };
      sites: {
        Row: {
          id: string;
          growatt_site_id: string;
          name: string;
          location: string;
          status: 'online' | 'offline' | 'warning';
          last_online_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          growatt_site_id: string;
          name: string;
          location: string;
          status?: 'online' | 'offline' | 'warning';
          last_online_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          growatt_site_id?: string;
          name?: string;
          location?: string;
          status?: 'online' | 'offline' | 'warning';
          last_online_at?: string | null;
          updated_at?: string;
        };
      };
      inverters: {
        Row: {
          id: string;
          site_id: string;
          serial: string;
          capacity: number;
          status: 'online' | 'offline' | 'fault';
          created_at: string;
          updated_at: string;
        };
      };
      site_metrics: {
        Row: {
          id: string;
          site_id: string;
          power: number;
          voltage: number;
          battery: number | null;
          temperature: number | null;
          recorded_at: string;
        };
      };
      alerts: {
        Row: {
          id: string;
          site_id: string;
          severity: 'info' | 'warning' | 'critical';
          message: string;
          acknowledged: boolean;
          acknowledged_by: string | null;
          acknowledged_at: string | null;
          created_at: string;
        };
      };
      engineer_assignments: {
        Row: {
          id: string;
          engineer_id: string;
          site_id: string;
          alert_id: string | null;
          status: 'pending' | 'in_progress' | 'resolved';
          assigned_at: string;
          resolved_at: string | null;
        };
      };
      field_reports: {
        Row: {
          id: string;
          assignment_id: string;
          engineer_id: string;
          report: string;
          images: string[];
          created_at: string;
        };
      };
    };
  };
}