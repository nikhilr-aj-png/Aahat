import { createClient } from 'npm:@supabase/supabase-js@2';

const jsonHeaders = { 'Content-Type': 'application/json' };
const encoder = new TextEncoder();

const base64Url = (input: Uint8Array | string) => {
  const bytes = typeof input === 'string' ? encoder.encode(input) : input;
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
};

const importPrivateKey = async (pem: string) => {
  const normalized = pem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '');
  const binary = atob(normalized);
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  return crypto.subtle.importKey(
    'pkcs8',
    bytes,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
};

const getGoogleAccessToken = async (serviceAccount: Record<string, string>) => {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64Url(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  }));
  const unsignedToken = `${header}.${claims}`;
  const key = await importPrivateKey(serviceAccount.private_key);
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    encoder.encode(unsignedToken)
  );
  const assertion = `${unsignedToken}.${base64Url(new Uint8Array(signature))}`;
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion
    })
  });
  if (!response.ok) throw new Error(`Google OAuth failed (${response.status})`);
  const payload = await response.json();
  if (!payload.access_token) throw new Error('Google OAuth returned no access token');
  return payload.access_token as string;
};

Deno.serve(async request => {
  try {
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: jsonHeaders });
    }

    const { notification_id: notificationId } = await request.json();
    if (!notificationId || !/^[0-9a-f-]{36}$/i.test(notificationId)) {
      return new Response(JSON.stringify({ error: 'notification_id is required' }), { status: 400, headers: jsonHeaders });
    }

    const serviceAccountRaw = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!serviceAccountRaw || !supabaseUrl || !serviceRoleKey) {
      throw new Error('Required server secrets are not configured');
    }

    const serviceAccount = JSON.parse(serviceAccountRaw) as Record<string, string>;
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    // Atomically claim the random notification UUID. A notification can invoke
    // FCM only once, so the public database webhook cannot be abused for replay.
    const { data: notification, error: notificationError } = await admin
      .from('user_notifications')
      .update({ push_dispatched_at: new Date().toISOString() })
      .eq('id', notificationId)
      .in('type', ['message', 'call'])
      .is('push_dispatched_at', null)
      .select('id,user_id,type,title,body,data')
      .maybeSingle();
    if (notificationError) throw notificationError;
    if (!notification) {
      return new Response(JSON.stringify({ sent: 0, reason: 'not_found_or_already_dispatched' }), { headers: jsonHeaders });
    }

    const { data: tokens, error: tokenError } = await admin
      .from('push_tokens')
      .select('id,token')
      .eq('user_id', notification.user_id)
      .eq('provider', 'fcm')
      .eq('is_active', true);
    if (tokenError) throw tokenError;
    if (!tokens?.length) {
      return new Response(JSON.stringify({ sent: 0, reason: 'no_active_tokens' }), { headers: jsonHeaders });
    }

    const { data: recipientProfile } = await admin
      .from('profiles')
      .select('notification_settings')
      .eq('id', notification.user_id)
      .maybeSingle();
    const notificationSettings = recipientProfile?.notification_settings && typeof recipientProfile.notification_settings === 'object'
      ? recipientProfile.notification_settings as Record<string, unknown>
      : {};
    const previewsEnabled = notification.type === 'call' || notificationSettings.previews !== false;
    const soundEnabled = notification.type === 'call' || notificationSettings.sound !== false;
    const accessToken = await getGoogleAccessToken(serviceAccount);
    const messageData = notification.data && typeof notification.data === 'object' ? notification.data : {};
    const stringData = {
      title: String(previewsEnabled ? (notification.title || 'Aahat') : 'Aahat'),
      body: String(previewsEnabled ? (notification.body || (notification.type === 'call' ? 'Incoming call' : 'You have a new message.')) : 'New message'),
      previewsEnabled: String(previewsEnabled),
      soundEnabled: String(soundEnabled),
      notificationType: String(notification.type || 'message'),
      notificationId: String(notification.id),
      conversationId: String(messageData.conversation_id || ''),
      messageId: String(messageData.message_id || ''),
      senderId: String(messageData.sender_id || ''),
      callId: String(messageData.call_id || ''),
      callType: String(messageData.call_type || '')
    };
    const endpoint = `https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`;

    const results = await Promise.all(tokens.map(async row => {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: {
            token: row.token,
            data: stringData,
            webpush: {
              headers: { Urgency: 'high', TTL: notification.type === 'call' ? '60' : '86400' }
            }
          }
        })
      });
      if (response.ok) return { ok: true, id: row.id };

      const errorPayload = await response.json().catch(() => ({}));
      const errorCode = errorPayload?.error?.details?.[0]?.errorCode || errorPayload?.error?.status || '';
      const invalid = ['UNREGISTERED', 'INVALID_ARGUMENT', 'NOT_FOUND'].includes(errorCode);
      if (invalid) {
        await admin.from('push_tokens').update({ is_active: false, updated_at: new Date().toISOString() }).eq('id', row.id);
      }
      return { ok: false, id: row.id, code: errorCode || String(response.status) };
    }));

    return new Response(JSON.stringify({
      sent: results.filter(result => result.ok).length,
      failed: results.filter(result => !result.ok).length
    }), { headers: jsonHeaders });
  } catch (error) {
    console.error('Message push dispatch failed:', error instanceof Error ? error.message : error);
    return new Response(JSON.stringify({ error: 'Push dispatch failed' }), { status: 500, headers: jsonHeaders });
  }
});
