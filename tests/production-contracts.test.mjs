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

test('delivery receipts distinguish sent delivered and read', async () => {
  const [migration, app, hook, bubble, theme] = await Promise.all([
    read('supabase/migrations/20260718_message_delivery_receipts.sql'),
    read('web/src/App.jsx'),
    read('web/src/hooks/useMessagesProduction.js'),
    read('web/src/components/MessageBubble.jsx'),
    read('web/src/resonance.css')
  ]);
  assert.match(migration, /function public\.mark_message_delivered/);
  assert.match(migration, /function public\.mark_pending_messages_delivered/);
  assert.match(migration, /when message_status\.status = 'read' then 'read'/);
  assert.match(app, /mark_pending_messages_delivered/);
  assert.match(app, /mark_message_delivered/);
  assert.match(app, /document\.visibilityState === 'visible'/);
  assert.match(hook, /table: 'message_status'/);
  assert.match(bubble, /msg\._status === 'delivered'/);
  assert.match(bubble, /msg\._status === 'read'/);
  assert.match(theme, /read-receipt\.delivered[\s\S]+color:\s*#fff/);
  assert.match(theme, /read-receipt\.read[\s\S]+color:\s*#1746c7/);
});
test('message notifications are durable, recipient-scoped and realtime', async () => {
  const [migration, app] = await Promise.all([
    read('supabase/migrations/20260718_realtime_message_notifications.sql'),
    read('web/src/App.jsx')
  ]);
  assert.match(migration, /trigger trg_create_message_notifications/);
  assert.match(migration, /insert into public\.user_notifications/);
  assert.match(migration, /cm\.user_id <> new\.sender_id/);
  assert.match(migration, /notifications_insert_own[\s\S]+user_id = auth\.uid\(\)/);
  assert.match(app, /table: 'user_notifications'/);
  assert.match(app, /filter: `user_id=eq\.\$\{user\.id\}`/);
  assert.match(app, /notification\.body/);
  assert.match(app, /mark_message_delivered/);
});

test('receipt fallback hydrates statuses independently of rich message relations', async () => {
  const hook = await read('web/src/hooks/useMessagesProduction.js');
  assert.match(hook, /hydrateMessageStatuses/);
  assert.match(hook, /from\('message_status'\)[\s\S]+\.in\('message_id', outgoingIds\)/);
  assert.match(hook, /data = await hydrateMessageStatuses\(data, user\.id\)/);
});

test('presence tracks visibility and connectivity without overwriting typing', async () => {
  const [presence, auth, contacts] = await Promise.all([
    read('web/src/hooks/usePresence.js'),
    read('web/src/hooks/useAuth.js'),
    read('web/src/components/ContactsSection.jsx')
  ]);
  assert.match(presence, /presenceState\(\)/);
  assert.match(presence, /event: 'join'/);
  assert.match(presence, /event: 'leave'/);
  assert.match(presence, /typingRef\.current/);
  assert.match(presence, /window\.addEventListener\('offline'/);
  assert.match(auth, /handleVisibility\(\);/);
  assert.match(auth, /window\.setInterval\(handleVisibility, 15000\)/);
  assert.match(contacts, /\? 'Online' : 'Offline'/);
});
test('conversation previews exclude messages deleted for the current user', async () => {
  const conversations = await read('web/src/hooks/useConversations.js');
  assert.match(conversations, /\.not\('deleted_for_users', 'cs', `\{\$\{user\.id\}\}`\)/);
  assert.match(conversations, /event: '\*', schema: 'public', table: 'messages'/);
  assert.match(conversations, /payload\.eventType !== 'INSERT'[\s\S]+fetchConversations\(\)/);
  assert.match(conversations, /previewText: '', previewTime: ''/);
});