/**
 * Supabase Client Configuration
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from './env.js';
import { Database } from '@/types/database.types.js';

class SupabaseConfig {
  private static instance: SupabaseClient<Database>;
  private static serviceInstance: SupabaseClient<Database>;

  public static getClient(): SupabaseClient<Database> {
    if (!SupabaseConfig.instance) {
      SupabaseConfig.instance = createClient<Database>(
        env.SUPABASE_URL,
        env.SUPABASE_ANON_KEY,
        {
          auth: {
            autoRefreshToken: true,
            persistSession: false,
          },
        }
      );
    }
    return SupabaseConfig.instance;
  }

  public static getServiceClient(): SupabaseClient<Database> {
    if (!SupabaseConfig.serviceInstance) {
      SupabaseConfig.serviceInstance = createClient<Database>(
        env.SUPABASE_URL,
        env.SUPABASE_SERVICE_KEY,
        {
          auth: {
            autoRefreshToken: false,
            persistSession: false,
          },
        }
      );
    }
    return SupabaseConfig.serviceInstance;
  }
}

export const supabase = SupabaseConfig.getClient();
export const supabaseAdmin = SupabaseConfig.getServiceClient();
