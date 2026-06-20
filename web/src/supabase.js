import { createClient } from '@supabase/supabase-js';

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://jxyobyinvflojrhrdcrf.supabase.co';
export const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_cZCSK2WrC9Y-8nC9vwJzLw_o8LRjIlY';

if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
  console.warn('Missing Supabase environment variables. Using default fallback configuration.');
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  },
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  }
});
