import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('APP_ORIGIN') || '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Authentication required' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const turnKeyId = Deno.env.get('CLOUDFLARE_TURN_KEY_ID');
  const turnApiToken = Deno.env.get('CLOUDFLARE_TURN_KEY_API_TOKEN');
  if (!supabaseUrl || !anonKey || !turnKeyId || !turnApiToken) {
    return json({ error: 'TURN service is not configured' }, 503);
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: { user }, error: authError } = await authClient.auth.getUser();
  if (authError || !user) return json({ error: 'Invalid session' }, 401);

  const response = await fetch(
    `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(turnKeyId)}/credentials/generate-ice-servers`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${turnApiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ttl: 3600 }),
    },
  );

  if (!response.ok) {
    console.error('Cloudflare TURN credential request failed', response.status, await response.text());
    return json({ error: 'TURN credentials are temporarily unavailable' }, 502);
  }

  const payload = await response.json();
  const iceServers = Array.isArray(payload?.iceServers) ? payload.iceServers : [];
  if (!iceServers.length) return json({ error: 'Cloudflare returned no ICE servers' }, 502);

  return json({ iceServers, expiresIn: 3600 });
});
