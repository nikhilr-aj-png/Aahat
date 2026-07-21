import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json'
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers });
  if (request.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = request.headers.get('Authorization');
  if (!url || !anonKey || !serviceRoleKey || !authorization) {
    return new Response(JSON.stringify({ error: 'Function is not configured' }), { status: 500, headers });
  }

  // Identify the caller from their own JWT (never trust an id from the body).
  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) return new Response(JSON.stringify({ error: 'Authentication required' }), { status: 401, headers });

  const { userId, reason } = await request.json().catch(() => ({ userId: '', reason: '' }));
  if (!userId || typeof userId !== 'string') {
    return new Response(JSON.stringify({ error: 'A target userId is required' }), { status: 400, headers });
  }

  // Enforce super-admin authorization, guards, and write the audit trail as the
  // calling admin. If any guard fails this raises and no deletion happens.
  const { error: prepareError } = await userClient.rpc('admin_prepare_user_deletion', {
    p_user_id: userId,
    p_reason: typeof reason === 'string' ? reason : ''
  });
  if (prepareError) {
    // Authorization / validation failures should read as 403, not 500.
    const forbidden = /Super admin access required|cannot delete your own|super admin cannot be deleted/i.test(prepareError.message);
    return new Response(JSON.stringify({ error: prepareError.message }), { status: forbidden ? 403 : 400, headers });
  }

  // Guards passed and the decision is audited — perform the privileged deletion.
  // The profile cascade removes the account's rows; moderation_actions retains
  // the snapshot in metadata via ON DELETE SET NULL.
  const admin = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await admin.auth.admin.deleteUser(userId, false);
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers });
  return new Response(JSON.stringify({ deleted: true }), { status: 200, headers });
});
