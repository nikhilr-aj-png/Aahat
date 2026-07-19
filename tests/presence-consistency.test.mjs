import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../web/src/App.jsx', import.meta.url), 'utf8');
const admin = readFileSync(new URL('../web/src/components/AdminEmbedProduction.jsx', import.meta.url), 'utf8');
const auth = readFileSync(new URL('../web/src/hooks/useAuth.js', import.meta.url), 'utf8');
const presence = readFileSync(new URL('../web/src/hooks/usePresence.js', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/migrations/202607190002_premium_admin_center.sql', import.meta.url), 'utf8');

test('chat and admin use one authoritative realtime presence source', () => {
  assert.match(app, /<AdminEmbedPanel[\s\S]*isUserOnline=\{isUserOnline\}/);
  assert.match(admin, /typeof isUserOnline === 'function'/);
  assert.match(admin, /profiles\.filter\(onlineState\)/);
  assert.match(admin, /onlineState\(user\) \? 'Online'/);
});

test('database presence is visibility-aware and expires stale flags', () => {
  assert.match(auth, /navigator\.onLine && document\.visibilityState === 'visible'/);
  assert.match(presence, /document\.addEventListener\('visibilitychange', handleConnectivity\)/);
  assert.match(migration, /is_online and last_seen > now\(\) - interval '45 seconds'/);
  assert.doesNotMatch(migration, /is_online or last_seen/);
});
