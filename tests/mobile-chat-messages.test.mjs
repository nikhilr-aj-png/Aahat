import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('mobile bottom navigation is hidden while a chat is open', async () => {
  const [app, styles, resonance] = await Promise.all([
    read('web/src/App.jsx'),
    read('web/src/index.css'),
    read('web/src/resonance.css')
  ]);
  assert.match(app, /isMobile && !\(activeTab === 'chats' && selectedConversationId\)/);
  assert.match(app, /mobile-chat-open/);
  assert.match(styles, /\.app-container\.mobile-chat-open\s*\{\s*padding-bottom:\s*0/);
  assert.match(resonance, /\.app-container\.mobile-chat-open\s*\{\s*padding-bottom:\s*0/);
});

test('messages use direct membership RLS and recover missed realtime events', async () => {
  const [hook, migration] = await Promise.all([
    read('web/src/hooks/useMessagesProduction.js'),
    read('supabase/migrations/20260717_fix_message_visibility_rls.sql')
  ]);
  assert.match(migration, /messages_select_member[\s\S]+is_conversation_member\(conversation_id\)/);
  assert.match(migration, /messages_insert_member[\s\S]+sender_id = auth\.uid\(\)[\s\S]+is_conversation_member/);
  assert.match(migration, /supabase_realtime[\s\S]+tablename = 'messages'/);
  assert.match(hook, /setInterval\(refresh, 5000\)/);
  assert.match(hook, /await fetchPage\(false\)/);
});

test('chat falls back to core messages and uses clean English empty text', async () => {
  const [hook, chatView] = await Promise.all([
    read('web/src/hooks/useMessagesProduction.js'),
    read('web/src/components/ChatView.jsx')
  ]);
  assert.match(hook, /Rich message query failed; loading core messages instead/);
  assert.match(
    hook,
    /fallbackQuery[\s\S]+sender:profiles!messages_sender_id_fkey[\s\S]+conversation_id/
  );
  assert.match(chatView, /Start your conversation with/);
});

test('message actions use a compact menu and support multi-select operations', async () => {
  const [bubble, chatView, styles] = await Promise.all([
    read('web/src/components/MessageBubble.jsx'),
    read('web/src/components/ChatView.jsx'),
    read('web/src/index.css')
  ]);
  assert.match(bubble, /message-action-menu/);
  assert.match(bubble, /<Reply[^>]*\/>Reply/);
  assert.match(bubble, /<Smile[^>]*\/>Emoji/);
  assert.match(bubble, /<Edit3[^>]*\/>Edit/);
  assert.match(bubble, /<Trash2[^>]*\/>Delete/);
  assert.match(bubble, /<ListChecks[^>]*\/>Select/);
  assert.doesNotMatch(bubble, /<Pin|<Star|<Share2/);
  assert.match(chatView, /selectedMessageIds/);
  assert.match(chatView, /Forward selected/);
  assert.match(chatView, /Delete selected/);
  assert.match(styles, /message-selection-toolbar/);
});

test('desktop message dropdown trigger stays inside the hovered bubble', async () => {
  const [bubble, styles] = await Promise.all([
    read('web/src/components/MessageBubble.jsx'),
    read('web/src/index.css')
  ]);
  assert.match(bubble, /<ChevronDown size=\{14\}/);
  assert.match(styles, /\.message-hover-actions[\s\S]+top:\s*5px[\s\S]+right:\s*5px/);
});

test('desktop dropdown override is outside mobile-only styling', async () => {
  const styles = await read('web/src/index.css');
  assert.match(
    styles,
    /@media \(min-width: 769px\)[\s\S]+\.message-bubble:hover > \.message-hover-actions[\s\S]+aria-expanded="true"/
  );
});

test('desktop message dropdown has a premium vertical menu treatment', async () => {
  const styles = await read('web/src/index.css');
  assert.match(styles, /\.message-action-menu[\s\S]+flex-direction:\s*column/);
  assert.match(styles, /premiumMessageMenuIn/);
  assert.match(styles, /backdrop-filter:\s*blur\(22px\)/);
  assert.match(styles, /\.message-action-menu button:hover[\s\S]+translateX\(2px\)/);
});

test('multi-message selection has premium toolbar and circular controls', async () => {
  const styles = await read('web/src/index.css');
  assert.match(styles, /Premium multi-message selection UI/);
  assert.match(styles, /\.message-selection-toolbar::before/);
  assert.match(styles, /\.message-select-toggle\.selected[\s\S]+linear-gradient/);
  assert.match(
    styles,
    /\.message-bubble-wrapper:has\(\.message-select-toggle\.selected\)/
  );
});

test('message emoji, inline edit, and popup exclusivity are production-safe', async () => {
  const [bubble, chatView, chatInput, styles] = await Promise.all([
    read('web/src/components/MessageBubble.jsx'),
    read('web/src/components/ChatView.jsx'),
    read('web/src/components/ChatInput.jsx'),
    read('web/src/index.css')
  ]);
  assert.match(bubble, /SAFE_REACTION_EMOJIS/);
  assert.match(chatInput, /SAFE_POPULAR_EMOJIS/);
  assert.doesNotMatch(bubble, /prompt\('Edit message:'/);
  assert.match(chatView, /editingMessage/);
  assert.match(chatInput, /Editing message/);
  assert.match(bubble, /isActionMenuOpen/);
  assert.match(bubble, /onMouseLeave/);
  assert.match(bubble, /const closeActions = \(\) =>/);
  assert.match(bubble, /onToggleReactionPicker\(null\)/);
  assert.match(bubble, /onToggleActionMenu\?\.\(null\)/);
  assert.match(styles, /\.message-action-menu\.left[\s\S]+left:\s*0/);
  assert.match(styles, /"Segoe UI Emoji"/);
});

test('message sub-actions stay inside one menu and selection controls are compact', async () => {
  const [bubble, chatInput, styles] = await Promise.all([
    read('web/src/components/MessageBubble.jsx'),
    read('web/src/components/ChatInput.jsx'),
    read('web/src/index.css')
  ]);
  assert.match(bubble, /message-action-emoji-grid/);
  assert.match(bubble, /Delete for everyone/);
  assert.match(bubble, /message-action-error/);
  assert.doesNotMatch(bubble, /position: 'absolute', bottom: '-50px'/);
  assert.match(chatInput, /replyTo\.content/);
  assert.match(styles, /\.message-select-toggle[\s\S]+width:\s*22px[\s\S]+margin:\s*0 10px/);
});

test('reply profile objects never render as React children', async () => {
  const [hook, input] = await Promise.all([
    read('web/src/hooks/useMessagesProduction.js'),
    read('web/src/components/ChatInput.jsx')
  ]);
  assert.doesNotMatch(hook, /reply_to:messages!/);
  assert.match(hook, /hydrateReplyTargets/);
  assert.match(hook, /typeof sender\?\.display_name === 'string'/);
  assert.match(input, /typeof replyTo\.senderName === 'string'/);
  assert.match(input, /typeof replyTo\.sender === 'string'/);
});
test('mobile chat scroll stays inside the message list and actions keep premium styling', async () => {
  const [chatView, styles] = await Promise.all([
    read('web/src/components/ChatView.jsx'),
    read('web/src/index.css')
  ]);
  assert.doesNotMatch(chatView, /scrollIntoView/);
  assert.match(chatView, /stickToBottomRef/);
  assert.match(chatView, /list\.scrollTo\(\{ top: list\.scrollHeight/);
  assert.match(styles, /Mobile chat viewport lock and premium message action sheet/);
  assert.match(styles, /body:has\(\.app-container\.mobile-chat-open\)[\s\S]+overflow:\s*hidden/);
  assert.match(styles, /@media \(max-width: 768px\)[\s\S]+\.message-action-menu[\s\S]+flex-direction:\s*column/);
});
test('message timestamps stay high contrast on every bubble', async () => {
  const theme = await read('web/src/resonance.css');
  assert.match(theme, /High-contrast message timestamps/);
  assert.match(theme, /\.message-info-row \.msg-time-stamp[\s\S]+color:\s*#fff[\s\S]+opacity:\s*1/);
});
test('mobile uses long press while direct chats hide sender avatars', async () => {
  const [bubble, chatView, styles] = await Promise.all([
    read('web/src/components/MessageBubble.jsx'),
    read('web/src/components/ChatView.jsx'),
    read('web/src/index.css')
  ]);
  assert.match(bubble, /createPortal/);
  assert.match(bubble, /longPressTimerRef/);
  assert.match(bubble, /onContextMenu=\{handleContextMenu\}/);
  assert.match(bubble, /showSenderAvatar && !isMe/);
  assert.match(chatView, /showSenderAvatar=\{conversation\.type === 'group'\}/);
  assert.match(styles, /Mobile long-press message actions[\s\S]+\.message-hover-actions[\s\S]+display:\s*none !important/);
  assert.match(styles, /\.message-action-portal-backdrop[\s\S]+place-items:\s*center/);
});
test('desktop open action menu stays above neighboring messages', async () => {
  const [bubble, theme] = await Promise.all([
    read('web/src/components/MessageBubble.jsx'),
    read('web/src/resonance.css')
  ]);
  assert.match(bubble, /isActionMenuOpen \? 'action-menu-open'/);
  assert.match(theme, /\.message-bubble-wrapper\.action-menu-open[\s\S]+z-index:\s*240/);
  assert.match(theme, /@media \(min-width: 769px\)[\s\S]+padding-right:\s*42px/);
});
test('closing the mobile action portal cannot restart long press', async () => {
  const bubble = await read('web/src/components/MessageBubble.jsx');
  assert.match(bubble, /message-action-portal-backdrop, \.message-action-menu, button/);
  assert.match(bubble, /event\.stopPropagation\(\);\s*cancelLongPress\(\);/);
  assert.match(bubble, /longPressStartRef\.current = null;\s*longPressTimerRef\.current = null;\s*openActions\(\);/);
});