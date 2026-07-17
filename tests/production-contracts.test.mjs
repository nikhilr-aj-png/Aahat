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

test('channel policies avoid channels and membership recursion', async () => {
  const migration = await read('supabase/migrations/20260717_fix_channel_rls.sql');
  assert.match(migration, /function public\.is_public_channel/);
  assert.match(migration, /function public\.is_channel_member/);
  assert.match(migration, /function public\.is_channel_admin/);
  assert.match(migration, /channels_select_public[\s\S]+is_channel_member\(id\)/);
  assert.match(migration, /ch_members_select[\s\S]+is_public_channel\(channel_id\)/);
  const selectPolicy = migration.match(/create policy "channels_select_public"[\s\S]+?;/)?.[0] || '';
  assert.match(selectPolicy, /is_channel_member\(id\)/);
  assert.doesNotMatch(selectPolicy, /select[\s\S]+channel_members/);
});

test('message action RPCs are deployable with membership checks', async () => {
  const migration = await read('supabase/migrations/20260717_message_action_rpcs.sql');
  assert.match(migration, /delete_message_for_me/);
  assert.match(migration, /clear_conversation_for_me/);
  assert.match(migration, /mark_conversation_read/);
  assert.match(migration, /is_conversation_member/);
  assert.match(migration, /grant execute[\s\S]+authenticated/);
});
