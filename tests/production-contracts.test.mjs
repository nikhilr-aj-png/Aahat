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
  assert.match(presence, /latest\.user_id \|\| key/);
  assert.doesNotMatch(presence, /profileOnlineUsers|presence-profile-fallback-/);
  assert.match(presence, /event: 'join'/);
  assert.match(presence, /event: 'leave'/);
  assert.match(presence, /typingRef\.current/);
  assert.match(presence, /window\.addEventListener\('offline'/);
  assert.match(presence, /generationRef\.current/);
  assert.match(presence, /setTimeout\([\s\S]+2500/);
  assert.doesNotMatch(presence, /\['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'\][\s\S]+setOnlineUsers\(new Map\(\)\)/);  assert.match(auth, /handleVisibility\(\);/);
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
test('background FCM push is token-scoped, one-time, and service-worker handled', async () => {
  const [migration, fn, app, firebase, worker] = await Promise.all([
    read('supabase/migrations/20260718_fcm_background_push.sql'),
    read('supabase/functions/send-message-push/index.ts'),
    read('web/src/App.jsx'),
    read('web/src/firebase.js'),
    read('web/public/sw.js')
  ]);
  assert.match(migration, /create table if not exists public\.push_tokens/);
  assert.match(migration, /function public\.register_push_token/);
  assert.match(migration, /trigger trg_dispatch_message_push/);
  assert.match(migration, /push_dispatched_at/);
  assert.match(fn, /firebase\.messaging/);
  assert.match(fn, /\.is\('push_dispatched_at', null\)/);
  assert.match(fn, /fcm\.googleapis\.com\/v1\/projects/);
  assert.match(app, /rpc\('register_push_token'/);
  assert.match(app, /URLSearchParams\(window\.location\.search\)/);
  assert.match(firebase, /publicVapidKey/);
  assert.match(worker, /onBackgroundMessage/);
  assert.match(worker, /notificationclick/);
});
test('12-hour hard delete keeps a privacy-safe tombstone and cleans media', async () => {
  const [migration, hook, bubble, input, compression] = await Promise.all([
    read('supabase/migrations/20260718_hard_delete_and_media_limits.sql'),
    read('web/src/hooks/useMessagesProduction.js'),
    read('web/src/components/MessageBubble.jsx'),
    read('web/src/components/ChatInput.jsx'),
    read('web/src/utils/mediaCompression.js')
  ]);
  assert.match(migration, /interval '12 hours'/);
  assert.match(migration, /insert into public\.deleted_messages/);
  assert.match(migration, /delete from public\.messages where id = target\.id/);
  assert.match(migration, /delete from public\.user_notifications/);
  assert.match(migration, /storage\.foldername\(name\)/);
  assert.doesNotMatch(migration, /target\.content/);
  assert.match(hook, /rpc\('delete_message_for_everyone'/);
  assert.match(hook, /from\('deleted_messages'\)/);
  assert.match(hook, /storage\.from\(data\.storage_bucket\)\.remove/);
  assert.match(bubble, /Delete for everyone \(within 12 hours\)/);
  assert.match(bubble, /You deleted this message/);
  assert.match(bubble, /message-video-attachment/);
  assert.match(input, /prepareChatMedia/);
  assert.doesNotMatch(input, /chat-media-limits/);
  assert.match(compression, /imageInputBytes: 5 \* 1024 \* 1024/);
  assert.match(compression, /image\/jpeg/);
  assert.match(compression, /imageOutputBytes: 1 \* 1024 \* 1024/);
  assert.match(compression, /videoOutputBytes: 25 \* 1024 \* 1024/);
});

test('photo limits warn above 5MB and are documented outside the composer', async () => {
  const [input, compression, settings, styles] = await Promise.all([
    read('web/src/components/ChatInput.jsx'),
    read('web/src/utils/mediaCompression.js'),
    read('web/src/components/SettingsPanelProduction.jsx'),
    read('web/src/settings-professional.css')
  ]);
  assert.match(compression, /imageInputBytes: 5 \* 1024 \* 1024/);
  assert.match(compression, /Photo is too large\. Select a photo up to/);
  assert.doesNotMatch(input, /chat-media-limits|Photos up to/);
  assert.match(settings, /About media sharing/);
  assert.match(settings, /including camera captures/);
  assert.match(styles, /\.settings-about-media/);
});
test('voice-note Storage lifecycle is owner-scoped and deletion-ready', async () => {
  const [migration, input, hook, deleteMigration] = await Promise.all([
    read('supabase/migrations/20260718_voice_notes_storage_policies.sql'),
    read('web/src/components/ChatInput.jsx'),
    read('web/src/hooks/useMessagesProduction.js'),
    read('supabase/migrations/20260718_hard_delete_and_media_limits.sql')
  ]);
  assert.match(migration, /voice_notes_owner_insert/);
  assert.match(migration, /voice_notes_owner_delete/);
  assert.match(migration, /storage\.foldername\(name\)/);
  assert.match(migration, /file_size_limit = 20971520/);
  assert.match(migration, /'audio\/webm'/);
  assert.match(input, /audioBitsPerSecond: 32_000/);
  assert.match(input, /Could not upload this voice note/);
  assert.match(hook, /'voice-notes'/);
  assert.match(deleteMigration, /'storage_bucket', bucket_name/);
  assert.match(hook, /storage\.from\(data\.storage_bucket\)\.remove/);
});
test('voice and video calling attach remote audio and recover signaling gaps', async () => {
  const [calling, overlay, app, migration] = await Promise.all([
    read('web/src/hooks/useCalling.js'),
    read('web/src/components/CallingOverlay.jsx'),
    read('web/src/App.jsx'),
    read('supabase/migrations/20260718_complete_chat_header_actions.sql')
  ]);
  assert.match(overlay, /<audio ref=\{remoteAudioRef\} autoPlay playsInline/);
  assert.match(calling, /const \[localStream, setLocalStream\]/);
  assert.match(calling, /const \[remoteStream, setRemoteStream\]/);
  assert.match(calling, /restoreIncomingCall/);
  assert.match(calling, /45000/);
  assert.match(app, /call-error-toast/);
  assert.match(migration, /create table if not exists public\.call_signaling/);
  assert.match(migration, /trg_incoming_call_notification/);
});

test('chat header search and info use full-history server methods with safe fallbacks', async () => {
  const [hook, chat, migration] = await Promise.all([
    read('web/src/hooks/useMessagesProduction.js'),
    read('web/src/components/ChatView.jsx'),
    read('supabase/migrations/20260718_complete_chat_header_actions.sql')
  ]);
  assert.match(hook, /rpc\('search_conversation_messages'/);
  assert.match(hook, /PGRST202/);
  assert.match(hook, /rpc\('list_conversation_media'/);
  assert.match(hook, /\.not\('attachment_url', 'is', null\)/);
  assert.match(chat, /Searching the full conversation/);
  assert.match(chat, /<video src=\{media\.attachment_url\} controls/);
  assert.match(migration, /function public\.search_conversation_messages/);
  assert.match(migration, /function public\.list_conversation_media/);
});

test('three-dot actions confirm destructive work and never delete membership', async () => {
  const [chat, conversations, migration] = await Promise.all([
    read('web/src/components/ChatView.jsx'),
    read('web/src/hooks/useConversations.js'),
    read('supabase/migrations/20260718_complete_chat_header_actions.sql')
  ]);
  assert.match(chat, /Clear this chat for you\?/);
  assert.match(chat, /Delete this chat from your list\?/);
  assert.match(chat, /busyMenuAction/);
  assert.match(conversations, /rpc\('delete_conversation_for_me'/);
  assert.doesNotMatch(conversations, /const deleteChat[\s\S]*from\('conversation_members'\)[\s\S]*\.delete\(\)/);
  assert.match(migration, /add column if not exists is_deleted/);
  assert.match(migration, /trg_restore_deleted_conversation/);
});

test('FCM dispatcher accepts incoming call notifications', async () => {
  const [edge, migration] = await Promise.all([
    read('supabase/functions/send-message-push/index.ts'),
    read('supabase/migrations/20260718_complete_chat_header_actions.sql')
  ]);
  assert.match(edge, /\.in\('type', \['message', 'call'\]\)/);
  assert.match(edge, /callId: String\(messageData\.call_id/);
  assert.match(migration, /new\.type not in \('message','call'\)/);
});

test('status creator fills the workspace and public channel creation is atomic', async () => {
  const [status, styles, channels, migration] = await Promise.all([
    read('web/src/components/StatusSection.jsx'),
    read('web/src/index.css'),
    read('web/src/hooks/useChannels.js'),
    read('supabase/migrations/20260718_atomic_public_channel_creation.sql')
  ]);
  assert.match(status, /status-create-workspace-overlay/);
  assert.match(status, /prepareChatMedia/);
  assert.doesNotMatch(status, /maxWidth: '440px'/);
  assert.match(styles, /\.status-create-workspace-overlay[\s\S]*position: absolute/);
  assert.match(styles, /height: 100dvh/);
  assert.match(channels, /rpc\('create_public_channel'/);
  assert.match(channels, /public-channel-directory/);
  assert.match(migration, /insert into public\.channels[\s\S]*insert into public\.channel_members/);
  assert.match(migration, /Repair channels created by the former two-query client flow/);
});

test('tablet app shell follows the dynamic viewport and keeps the bottom edge visible', async () => {
  const [base, polish] = await Promise.all([
    read('web/src/index.css'),
    read('web/src/resonance.css')
  ]);
  assert.match(base, /#root[\s\S]*?height: 100vh;[\s\S]*?height: 100dvh;/);
  assert.match(base, /height: calc\(100dvh - 24px\)/);
  assert.match(polish, /@media \(min-width: 769px\) and \(max-width: 1366px\)/);
  assert.match(polish, /padding-bottom: max\(8px, env\(safe-area-inset-bottom\)\)/);
  assert.match(polish, /\.app-container \{[\s\S]*?height: 100%;[\s\S]*?max-height: 100%;[\s\S]*?min-height: 0;/);
  assert.match(polish, /\.settings-panel-container,[\s\S]*?\.status-section-container \{[\s\S]*?min-height: 0;/);
});

test('trusted-time startup uses a compact branded splash while failures stay actionable', async () => {
  const [gate, styles] = await Promise.all([
    read('web/src/components/ClockIntegrityGate.jsx'),
    read('web/src/clock-integrity.css')
  ]);
  assert.match(gate, /state === 'checking'/);
  assert.match(gate, /clock-gate-splash/);
  assert.match(gate, /Preparing your secure space/);
  assert.match(gate, /role="status" aria-live="polite"/);
  assert.match(gate, /role="alert" aria-live="assertive"/);
  assert.match(gate, /Check again/);
  assert.match(styles, /\.clock-splash-orbit/);
  assert.match(styles, /\.clock-splash-progress/);
  assert.match(styles, /prefers-reduced-motion/);
});

test('every touch-capable device can pull from the top edge to refresh Aahat', async () => {
  const [component, styles, main] = await Promise.all([
    read('web/src/components/TouchPullToRefresh.jsx'),
    read('web/src/components/TouchPullToRefresh.css'),
    read('web/src/main.jsx')
  ]);
  assert.match(component, /navigator\.maxTouchPoints/);
  assert.match(component, /touch\.clientY > EDGE_START_PX/);
  assert.match(component, /scrollTop > 0/);
  assert.match(component, /REFRESH_THRESHOLD_PX/);
  assert.match(component, /document\.addEventListener\('touchmove', handleTouchMove, \{ passive: false \}\)/);
  assert.match(component, /event\.preventDefault\(\)/);
  assert.match(component, /window\.location\.reload\(\)/);
  assert.match(component, /Release to refresh/);
  assert.doesNotMatch(component, /innerWidth|matchMedia|769px|1366px/);
  assert.match(styles, /\.touch-refresh-indicator/);
  assert.match(styles, /safe-area-inset-top/);
  assert.match(styles, /z-index: 5000/);
  assert.match(main, /import TouchPullToRefresh/);
  assert.match(main, /<TouchPullToRefresh \/>/);
});
