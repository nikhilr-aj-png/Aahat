import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Settings security backend supports device and session registration', async () => {
  const migration = await readFile(
    new URL('../supabase/migrations/20260717_settings_security_backend.sql', import.meta.url),
    'utf8'
  );
  assert.match(migration, /create table if not exists public\.user_devices/i);
  assert.match(migration, /device_fingerprint text/i);
  assert.match(migration, /user_id, device_fingerprint/i);
  assert.match(migration, /create table if not exists public\.user_sessions/i);
  assert.match(migration, /user_id, client_session_id/i);
  assert.match(migration, /create policy "devices_own"/i);
  assert.match(migration, /create policy "sessions_own"/i);
  assert.match(migration, /get_my_blocked_users/i);
});
