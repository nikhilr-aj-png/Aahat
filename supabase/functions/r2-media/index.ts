import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from 'npm:@aws-sdk/client-s3@3.864.0';
import { getSignedUrl } from 'npm:@aws-sdk/s3-request-presigner@3.864.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('APP_ORIGIN') || '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

const LIMITS = {
  image: 2 * 1024 * 1024,
  video: 50 * 1024 * 1024,
  audio: 10 * 1024 * 1024,
  document: 20 * 1024 * 1024,
} as const;

const DOCUMENT_TYPES = new Set([
  'application/pdf',
  'application/zip',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
]);

const classify = (contentType: string) => {
  if (/^image\/(jpeg|png|webp|gif)$/.test(contentType)) return 'image';
  if (/^video\/(mp4|webm|quicktime)$/.test(contentType)) return 'video';
  if (/^audio\/(mpeg|mp4|webm|wav|ogg)$/.test(contentType)) return 'audio';
  if (DOCUMENT_TYPES.has(contentType)) return 'document';
  return null;
};

const safeExtension = (filename: string) => {
  const extension = filename.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '');
  return extension && extension.length <= 8 ? extension : 'bin';
};

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Authentication required' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const accountId = Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
  const accessKeyId = Deno.env.get('CLOUDFLARE_R2_ACCESS_KEY_ID');
  const secretAccessKey = Deno.env.get('CLOUDFLARE_R2_SECRET_ACCESS_KEY');
  const bucket = Deno.env.get('CLOUDFLARE_R2_BUCKET');
  if (!supabaseUrl || !anonKey || !accountId || !accessKeyId || !secretAccessKey || !bucket) {
    return json({ error: 'R2 media service is not configured' }, 503);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return json({ error: 'Invalid session' }, 401);

  const r2 = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return json({ error: 'Invalid JSON body' }, 400); }
  const action = String(body.action || '');

  if (action === 'create-upload') {
    const conversationId = String(body.conversationId || '');
    const filename = String(body.filename || 'file.bin').slice(0, 180);
    const contentType = String(body.contentType || '').toLowerCase();
    const size = Number(body.size || 0);
    const category = classify(contentType);
    if (!conversationId || !category || !Number.isSafeInteger(size) || size <= 0 || size > LIMITS[category]) {
      return json({ error: 'Unsupported file type or file size exceeds the allowed limit' }, 400);
    }
    const { data: membership } = await userClient.from('conversation_members')
      .select('conversation_id').eq('conversation_id', conversationId).eq('user_id', user.id).maybeSingle();
    if (!membership) return json({ error: 'Conversation access denied' }, 403);

    const objectKey = `conversations/${conversationId}/${user.id}/${crypto.randomUUID()}.${safeExtension(filename)}`;
    const uploadUrl = await getSignedUrl(r2, new PutObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      ContentType: contentType,
    }), { expiresIn: 300 });
    return json({ uploadUrl, objectKey, contentType, maxBytes: LIMITS[category], expiresIn: 300 });
  }

  if (action === 'finalize-upload') {
    const conversationId = String(body.conversationId || '');
    const objectKey = String(body.objectKey || '');
    const contentType = String(body.contentType || '').toLowerCase();
    const expectedSize = Number(body.size || 0);
    const category = classify(contentType);
    const requiredPrefix = `conversations/${conversationId}/${user.id}/`;
    if (!category || !objectKey.startsWith(requiredPrefix)) return json({ error: 'Upload access denied' }, 403);
    const { data: membership } = await userClient.from('conversation_members')
      .select('conversation_id').eq('conversation_id', conversationId).eq('user_id', user.id).maybeSingle();
    if (!membership) return json({ error: 'Conversation access denied' }, 403);

    const head = await r2.send(new HeadObjectCommand({ Bucket: bucket, Key: objectKey }));
    const actualSize = Number(head.ContentLength || 0);
    const actualType = String(head.ContentType || '').toLowerCase();
    if (actualSize !== expectedSize || actualSize <= 0 || actualSize > LIMITS[category] || actualType !== contentType) {
      await r2.send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }));
      return json({ error: 'Uploaded object failed size or content-type verification' }, 400);
    }
    const downloadUrl = await getSignedUrl(r2, new GetObjectCommand({ Bucket: bucket, Key: objectKey }), { expiresIn: 300 });
    return json({ objectKey, downloadUrl, verifiedSize: actualSize, verifiedAt: new Date().toISOString(), expiresIn: 300 });
  }

  if (action === 'sign-downloads') {
    const messageIds = Array.isArray(body.messageIds)
      ? [...new Set(body.messageIds.map(String))].slice(0, 100)
      : [];
    if (!messageIds.length) return json({ urls: {} });
    const { data: messages, error } = await userClient.from('messages')
      .select('id,conversation_id,attachment_object_key,attachment_provider')
      .in('id', messageIds)
      .eq('attachment_provider', 'r2');
    if (error) return json({ error: 'Media access denied' }, 403);
    const entries = await Promise.all((messages || []).filter(row => (
      row.attachment_object_key
      && row.attachment_object_key.startsWith(`conversations/${row.conversation_id}/`)
    )).map(async row => [
      row.id,
      await getSignedUrl(r2, new GetObjectCommand({ Bucket: bucket, Key: row.attachment_object_key }), { expiresIn: 300 }),
    ]));
    return json({ urls: Object.fromEntries(entries), expiresIn: 300 });
  }

  return json({ error: 'Unsupported action' }, 400);
});
