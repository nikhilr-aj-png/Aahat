import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('chat media buckets are private and read only by conversation members', async () => {
  const migration = await read('supabase/migrations/202607210002_expiring_attachments.sql');

  // Anonymous read of chat media is revoked.
  assert.match(migration, /drop policy if exists "Allow public select" on storage\.objects/);
  assert.match(migration, /drop policy if exists "voice_notes_public_read" on storage\.objects/);
  assert.match(migration, /set public = false[\s\S]{0,60}where id = 'voice-notes'/);
  assert.match(migration, /public = false,[\s\S]{0,900}where id = 'attachments'/);

  // Reads resolve through the message row, so stripping it revokes access.
  assert.match(migration, /create policy "chat_media_read_conversation_members"/);
  assert.match(migration, /m\.attachment_path = storage\.objects\.name[\s\S]{0,120}is_conversation_member/);

  // The consumer may delete exactly the object they just consumed.
  assert.match(migration, /create policy "chat_media_delete_consumer"/);
  assert.match(migration, /q\.status = 'pending'/);

  // A DELETE cannot affect a row the caller cannot see, so the read policy has
  // to keep a window open for the consumer while their purge is pending —
  // otherwise every immediate delete silently no-ops.
  assert.match(
    migration,
    /create policy "chat_media_read_conversation_members"[\s\S]{0,1200}attachment_purge_queue q[\s\S]{0,200}q\.status = 'pending'/
  );
});

test('attachment bucket and path are derived server-side, never trusted from the client', async () => {
  const migration = await read('supabase/migrations/202607210002_expiring_attachments.sql');

  assert.match(migration, /function public\.messages_sync_attachment_object/);
  assert.match(migration, /create trigger trg_messages_sync_attachment_object/);
  assert.match(migration, /before insert or update of attachment_url on public\.messages/);
  // History is backfilled so existing media keeps resolving.
  assert.match(migration, /where attachment_url is not null[\s\S]{0,60}attachment_path is null/);
  assert.match(migration, /idx_messages_attachment_object/);
});

test('reads go through short-lived signed URLs', async () => {
  const [hook, bubble, chat] = await Promise.all([
    read('web/src/hooks/useMessagesProduction.js'),
    read('web/src/components/MessageBubble.jsx'),
    read('web/src/components/ChatView.jsx')
  ]);

  assert.match(hook, /createSignedUrl\(object\.path, SIGNED_URL_TTL_SECONDS\)/);
  assert.match(hook, /const getAttachmentUrl = useCallback/);
  // Downloads and voice-note playback both sign on demand.
  assert.match(bubble, /const signedUrl = await onResolveAttachmentUrl\?\.\(msg\)/);
  assert.match(bubble, /new Audio\(signedUrl\)/);
  assert.doesNotMatch(bubble, /new Audio\(msg\.attachment_url\)/);
  assert.doesNotMatch(bubble, /fetch\(msg\.attachment_url/);
  // Shared media opens via a signed URL rather than a stored public link.
  assert.match(chat, /openSharedMedia/);
  assert.doesNotMatch(chat, /href=\{media\.attachment_url\}/);
});

test('expiring media cannot be forwarded into another conversation', async () => {
  const chat = await read('web/src/components/ChatView.jsx');

  assert.match(chat, /forwardingMessages\.filter\(message => !message\.attachment_url\)/);
  assert.match(chat, /cannot be re-shared/);
});

test('orphan sweep is super-admin only and never leaves storage rows behind', async () => {
  const [migration, fn] = await Promise.all([
    read('supabase/migrations/202607210002_expiring_attachments.sql'),
    read('supabase/functions/purge-expired-media/index.ts')
  ]);

  // Sweep helpers are service-role only.
  assert.match(migration, /function public\.list_orphaned_media_objects/);
  assert.match(migration, /revoke all on function public\.list_orphaned_media_objects\(integer\) from anon, authenticated/);
  assert.match(migration, /revoke all on function public\.list_pending_attachment_purges\(integer\) from anon, authenticated/);
  assert.match(migration, /revoke all on function public\.finalize_media_purge\(text, text, boolean, text\) from anon, authenticated/);
  // A grace period stops the sweep racing an in-flight upload.
  assert.match(migration, /o\.created_at < now\(\) - interval '1 hour'/);

  // The function authorizes as the caller, then acts with the service role.
  assert.match(fn, /userClient\.rpc\('is_super_admin'\)/);
  assert.match(fn, /Super admin access required/);
  assert.match(fn, /list_pending_attachment_purges/);
  assert.match(fn, /list_orphaned_media_objects/);
  // Deleting the object also clears the upload ledger row.
  assert.match(fn, /from\('storage_files'\)\s*\.delete\(\)/);
  assert.doesNotMatch(fn, /SERVICE_ROLE[\s\S]{0,80}console\.log/);
});

test('the upload ledger exists and is owner-scoped', async () => {
  const migration = await read('supabase/migrations/202607210002_expiring_attachments.sql');

  assert.match(migration, /create table if not exists public\.storage_files/);
  assert.match(migration, /unique \(bucket_id, object_path\)/);
  assert.match(migration, /create policy "storage_files_select_owner"[\s\S]{0,120}owner_id = auth\.uid\(\)/);
  assert.match(migration, /revoke all on public\.storage_files from anon/);
});
