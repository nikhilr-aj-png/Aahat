import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('trusted server time gates the app and timestamps follow device hour format', async () => {
  const [migration, gate, main, formatter, bubble, conversations] = await Promise.all([
    read('supabase/migrations/20260718_trusted_device_time.sql'),
    read('web/src/components/ClockIntegrityGate.jsx'),
    read('web/src/main.jsx'),
    read('web/src/utils/dateTime.js'),
    read('web/src/components/MessageBubble.jsx'),
    read('web/src/hooks/useConversations.js')
  ]);
  assert.match(migration, /function public\.get_trusted_server_time/);
  assert.match(migration, /clock_timestamp\(\)/);
  assert.match(migration, /grant execute[\s\S]+to anon, authenticated/);
  assert.match(gate, /rpc\('get_trusted_server_time'\)/);
  assert.match(gate, /performance\.now\(\)/);
  assert.match(gate, /MAX_CLOCK_SKEW_MS/);
  assert.match(main, /<ClockIntegrityGate>[\s\S]+<App \/>/);
  assert.match(formatter, /Intl\.DateTimeFormat\(undefined/);
  assert.doesNotMatch(formatter, /hour12:/);
  assert.match(bubble, /formatDeviceTime\(msg\.created_at\)/);
  assert.match(conversations, /formatDeviceTime\(msg\.created_at\)/);
});
