import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('one-to-one calls use WebRTC media and authenticated private Realtime signaling', async () => {
  const [hook, migration, repairMigration, turnFunction] = await Promise.all([
    read('web/src/hooks/useCallingSecure.js'),
    read('supabase/migrations/20260718_private_webrtc_and_r2_media.sql'),
    read('supabase/migrations/202607190001_repair_secure_call_rpc.sql'),
    read('supabase/functions/rtc-credentials/index.ts'),
  ]);
  assert.match(hook, /new RTCPeerConnection/);
  assert.match(hook, /navigator\.mediaDevices\.getUserMedia/);
  assert.match(hook, /pc\.addTrack/);
  assert.match(hook, /pc\.createOffer/);
  assert.match(hook, /pc\.createAnswer/);
  assert.match(hook, /addIceCandidate/);
  assert.match(hook, /stun:stun\.cloudflare\.com:3478/);
  assert.match(hook, /config: \{ private: true/);
  assert.match(hook, /event: 'call-event'/);
  assert.match(hook, /restartIce/);
  assert.doesNotMatch(hook, /from\('call_signaling'\)/);
  assert.doesNotMatch(hook, /VITE_TURN_(USERNAME|CREDENTIAL)/);
  assert.match(turnFunction, /generate-ice-servers/);
  assert.match(turnFunction, /CLOUDFLARE_TURN_KEY_API_TOKEN/);
  assert.match(turnFunction, /auth\.getUser/);
  assert.match(migration, /on realtime\.messages for select to authenticated/);
  assert.match(migration, /on realtime\.messages for insert to authenticated/);
  assert.match(migration, /can_access_call_realtime_topic/);
  assert.match(migration, /start_direct_call/);
  assert.match(repairMigration, /create or replace function public\.start_direct_call/);
  assert.match(repairMigration, /create or replace function public\.set_call_status/);
  assert.match(repairMigration, /perform realtime\.send/);
  assert.match(repairMigration, /notify pgrst, 'reload schema'/);
  assert.match(repairMigration, /grant execute on function public\.start_direct_call\(uuid, uuid, text\) to authenticated/);
  assert.doesNotMatch(
    migration,
    /'call:' \|\| updated_call\.id::text,\s*drop policy/
  );
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /receiver_id uuid/);
  assert.match(migration, /answered_at timestamptz/);
});

test('chat media uses existing Supabase Storage and delete-for-everyone cleans its object', async () => {
  const [hook, migration] = await Promise.all([
    read('web/src/hooks/useMessagesProduction.js'),
    read('supabase/migrations/20260718_hard_delete_and_media_limits.sql'),
  ]);
  assert.match(hook, /supabase\.storage\.from\(bucket\)\.upload/);
  assert.match(hook, /getPublicUrl/);
  assert.match(hook, /storage_files/);
  assert.match(hook, /storage\.from\(data\.storage_bucket\)\.remove/);
  assert.match(hook, /complete_deleted_message_storage/);
  assert.doesNotMatch(hook, /uploadChatMediaToR2|hydrateR2MediaUrls|attachment_object_key/);
  assert.match(migration, /interval '12 hours'/);
  assert.match(migration, /'storage_bucket', bucket_name/);
});

test('Cloudflare stays disabled until the optional future flag is explicitly enabled', async () => {
  const [env, docs, hook] = await Promise.all([
    read('.env.example'),
    read('docs/MEDIA_CALLING_SETUP.md'),
    read('web/src/hooks/useCallingSecure.js'),
  ]);
  assert.match(env, /VITE_ENABLE_CLOUDFLARE_TURN=false/);
  assert.match(env, /CLOUDFLARE_TURN_KEY_API_TOKEN=your_/);
  assert.match(env, /CLOUDFLARE_R2_SECRET_ACCESS_KEY=your_/);
  assert.doesNotMatch(env, /VITE_CLOUDFLARE_TURN_KEY_API_TOKEN/);
  assert.doesNotMatch(env, /VITE_CLOUDFLARE_R2_SECRET_ACCESS_KEY/);
  assert.match(hook, /VITE_ENABLE_CLOUDFLARE_TURN !== 'true'/);
  assert.match(docs, /Cloudflare R2 and TURN are retained only as an optional future upgrade/);
});
