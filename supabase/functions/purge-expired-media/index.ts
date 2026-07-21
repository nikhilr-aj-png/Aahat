import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json'
};

const CHUNK = 100;

/**
 * Safety net for auto-expiring chat media.
 *
 * The hot path already deletes the object: the receiver consumes the message
 * (which revokes read access) and removes the object straight away. This
 * function exists for the two cases that path cannot cover:
 *   1. purges whose storage delete was interrupted (queue rows still pending),
 *   2. orphans — objects no live message references at all, e.g. an upload
 *      whose message insert never landed.
 *
 * Super-admin only. Intended to be called on a schedule.
 */
Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers });
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });
  }

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
  if (userError || !user) {
    return new Response(JSON.stringify({ error: 'Authentication required' }), { status: 401, headers });
  }

  // Sweeping storage is a privileged, destructive operation. Authorization is
  // decided by the existing helper under the caller's own identity.
  const { data: isSuperAdmin, error: adminCheckError } = await userClient.rpc('is_super_admin');
  if (adminCheckError || !isSuperAdmin) {
    return new Response(JSON.stringify({ error: 'Super admin access required' }), { status: 403, headers });
  }

  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });

  const removeAll = async (bucket: string, paths: string[]) => {
    let removed = 0;
    const failures: string[] = [];
    for (let index = 0; index < paths.length; index += CHUNK) {
      const batch = paths.slice(index, index + CHUNK);
      const { error } = await admin.storage.from(bucket).remove(batch);
      if (error) failures.push(`${bucket}: ${error.message}`);
      else removed += batch.length;
    }
    return { removed, failures };
  };

  const report = { purgesCompleted: 0, orphansRemoved: 0, errors: [] as string[] };

  // 1. Finish interrupted purges.
  const { data: pending, error: pendingError } = await admin
    .rpc('list_pending_attachment_purges', { p_limit: 500 });
  if (pendingError) report.errors.push(`pending: ${pendingError.message}`);

  for (const row of pending ?? []) {
    const { error } = await admin.storage.from(row.storage_bucket).remove([row.storage_path]);
    const { error: finalizeError } = await admin.rpc('finalize_media_purge', {
      p_bucket: row.storage_bucket,
      p_path: row.storage_path,
      p_success: !error,
      p_error: error?.message ?? null
    });
    if (error) report.errors.push(`purge ${row.storage_path}: ${error.message}`);
    else report.purgesCompleted += 1;
    if (finalizeError) report.errors.push(`finalize ${row.storage_path}: ${finalizeError.message}`);
  }

  // 2. Remove orphans (objects older than the grace period with no message).
  const { data: orphans, error: orphanError } = await admin
    .rpc('list_orphaned_media_objects', { p_limit: 500 });
  if (orphanError) report.errors.push(`orphans: ${orphanError.message}`);

  const byBucket = new Map<string, string[]>();
  for (const row of orphans ?? []) {
    byBucket.set(row.bucket_id, [...(byBucket.get(row.bucket_id) ?? []), row.object_path]);
  }
  for (const [bucket, paths] of byBucket) {
    const { removed, failures } = await removeAll(bucket, paths);
    report.orphansRemoved += removed;
    report.errors.push(...failures);
    // Keep the upload ledger consistent with what actually remains.
    for (const path of paths) {
      await admin.from('storage_files').delete().eq('bucket_id', bucket).eq('object_path', path);
    }
  }

  return new Response(JSON.stringify(report), { status: report.errors.length ? 207 : 200, headers });
});
