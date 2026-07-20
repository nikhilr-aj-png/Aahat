import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Settings security backend supports device and session registration', async () => {
  const [migration, settings, identity, section] = await Promise.all([
    readFile(new URL('../supabase/migrations/20260717_settings_security_backend.sql', import.meta.url), 'utf8'),
    readFile(new URL('../web/src/components/SettingsPanelProduction.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../web/src/utils/deviceIdentity.js', import.meta.url), 'utf8'),
    readFile(new URL('../web/src/components/DeviceSessionsSection.jsx', import.meta.url), 'utf8')
  ]);
  assert.match(migration, /create table if not exists public\.user_devices/i);
  assert.match(migration, /device_fingerprint text/i);
  assert.match(migration, /user_id, device_fingerprint/i);
  assert.match(migration, /create table if not exists public\.user_sessions/i);
  assert.match(migration, /user_id, client_session_id/i);
  assert.match(migration, /create policy "devices_own"/i);
  assert.match(migration, /create policy "sessions_own"/i);
  assert.match(migration, /get_my_blocked_users/i);
  assert.doesNotMatch(settings, /navigator\.platform/);
  assert.match(settings, /getDeviceIdentity\(\)/);
  assert.match(settings, /device:user_devices!user_sessions_device_id_fkey/);
  assert.match(settings, /scope: 'others'/);
  assert.match(identity, /getHighEntropyValues\(\['model', 'platform'\]\)/);
  assert.match(identity, /Android phone/);
  assert.match(section, /Current device/);
  assert.match(section, /same phone can have separate browser and PWA sessions/i);
  assert.match(section, /onRenameDevice/);
  assert.doesNotMatch(section, /window\.prompt/);
  assert.match(section, /Rename this device/);
  assert.match(section, /device-rename-dialog/);
  assert.match(section, /maxLength=\{60\}/);
});
