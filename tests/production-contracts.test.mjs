import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('core production RPCs are defined and client-wired', async () => {
  const migration = await read('supabase/migrations/20260715_production_readiness.sql');
  const messages = await read('web/src/hooks/useMessagesProduction.js');
  const conversations = await read('web/src/hooks/useConversations.js');
  for (const rpc of ['delete_message_for_me', 'clear_conversation_for_me', 'mark_conversation_read']) {
    assert.match(migration, new RegExp(`function public\\.${rpc}`));
    assert.match(`${messages}\n${conversations}`, new RegExp(`['\"]${rpc}['\"]`));
  }
});

test('race-prone counters are database-triggered, not client-updated', async () => {
  const migration = await read('supabase/migrations/20260715_production_readiness.sql');
  const statuses = await read('web/src/hooks/useStatuses.js');
  const channels = await read('web/src/hooks/useChannels.js');
  assert.match(migration, /trg_sync_status_view_count/);
  assert.match(migration, /trg_sync_channel_subscriber_count/);
  assert.doesNotMatch(statuses, /update\(\{ view_count:/);
  assert.doesNotMatch(channels, /update\(\{ subscriber_count:/);
});

test('mock production panels and legacy data hook are no longer imported', async () => {
  const app = await read('web/src/App.jsx');
  assert.match(app, /SettingsPanelProduction/);
  assert.match(app, /AdminEmbedProduction/);
  assert.match(app, /AuthScreenProduction/);
  assert.match(app, /useMessagesProduction/);
  assert.doesNotMatch(app, /components\/SettingsPanel';/);
});

test('account deletion requires an authenticated edge function and confirmation phrase', async () => {
  const fn = await read('supabase/functions/delete-account/index.ts');
  assert.match(fn, /auth\.getUser\(\)/);
  assert.match(fn, /DELETE MY AAHAT ACCOUNT/);
  assert.match(fn, /auth\.admin\.deleteUser/);
});
