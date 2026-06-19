import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://jxyobyinvflojrhrdcrf.supabase.co';
const supabaseKey = 'sb_publishable_cZCSK2WrC9Y-8nC9vwJzLw_o8LRjIlY';

export const supabase = createClient(supabaseUrl, supabaseKey);
