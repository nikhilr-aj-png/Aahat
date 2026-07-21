import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('chat header drops the back button and opens contact info from the profile block', async () => {
  const chat = await read('web/src/components/ChatView.jsx');

  // Back button is gone from the header markup and its import.
  assert.doesNotMatch(chat, /id="btn-back"/);
  assert.doesNotMatch(chat, /ArrowLeft/);
  assert.doesNotMatch(chat, /className="btn-icon mobile-back"/);

  // Profile block is a button that opens the details page.
  assert.match(chat, /className="chat-header-info"[\s\S]{0,200}setShowGroupDetails\(true\)/);
  assert.match(chat, /id="btn-header-profile"/);

  // Calls stay in the header; search and info moved into the existing menu.
  assert.match(chat, /id="btn-call-voice"/);
  assert.match(chat, /id="btn-call-video"/);
  assert.match(chat, /chat-dropdown-menu[\s\S]{0,900}id="btn-search-chat"/);
  assert.match(chat, /chat-dropdown-menu[\s\S]{0,900}id="btn-info-chat"/);
  assert.doesNotMatch(chat, /chat-header-actions[\s\S]{0,400}id="btn-info-chat"/);

  // The three-dot menu keeps its existing conversation actions.
  for (const label of ['Archive Chat', 'Mute Notifications', 'Clear Chat', 'Delete Chat']) {
    assert.match(chat, new RegExp(label));
  }

  // Removing the back button leaves an edge swipe as the mobile escape hatch.
  assert.match(chat, /handleEdgeSwipeStart/);
  assert.match(chat, /onBack\(\)/);
});

test('last seen follows the device 12 or 24 hour clock', async () => {
  const dateTime = await read('web/src/utils/dateTime.js');
  const chat = await read('web/src/components/ChatView.jsx');

  assert.match(dateTime, /resolveDeviceHourCycle/);
  assert.match(dateTime, /hourCycle === 'h23' \|\| hourCycle === 'h24'/);
  assert.match(dateTime, /hour: is24Hour \? '2-digit' : 'numeric'/);
  assert.match(dateTime, /hourCycle\s*\n?\s*\}\);/);
  assert.match(dateTime, /export function isDevice24HourClock/);
  // No hard-coded hour12 flag anywhere in the formatter path.
  assert.doesNotMatch(dateTime, /hour12: (true|false)/);
  assert.match(chat, /const time = formatDeviceTime\(seen\)/);
});

test('the composer sends several files at once as compact attachments', async () => {
  const [input, app] = await Promise.all([
    read('web/src/components/ChatInput.jsx'),
    read('web/src/App.jsx')
  ]);

  assert.match(input, /multiple/);
  assert.match(input, /const \[attachments, setAttachments\] = useState\(\[\]\)/);
  assert.match(input, /Array\.from\(e\.target\.files \|\| \[\]\)/);
  assert.match(input, /className="attachment-queue"/);
  assert.match(input, /attachment-chip-copy/);
  // Chips list name, type and size instead of previewing the media.
  assert.match(input, /describeAttachmentType\(attachment\.mimeType, attachment\.name, kind\)/);
  assert.match(input, /formatBytes\(attachment\.size\)/);
  assert.doesNotMatch(input, /className="attachment-preview"/);

  // Each queued attachment becomes its own message.
  assert.match(app, /Array\.isArray\(attachmentPayload\) \? attachmentPayload : \[attachmentPayload\]/);
  assert.match(app, /sendOneMessage\(index === 0 \? text : ''/);
});

test('attachments are purged from both sides once the receiver downloads them', async () => {
  const [migration, hook, bubble, attachments] = await Promise.all([
    read('supabase/migrations/202607210002_expiring_attachments.sql'),
    read('web/src/hooks/useMessagesProduction.js'),
    read('web/src/components/MessageBubble.jsx'),
    read('web/src/utils/attachments.js')
  ]);

  // Server strips the attachment for everyone and queues the storage purge.
  assert.match(migration, /function public\.consume_message_attachment/);
  assert.match(migration, /set attachment_url = null/);
  assert.match(migration, /attachment_consumed_at = now\(\)/);
  assert.match(migration, /insert into public\.attachment_purge_queue/);
  // The sender re-opening their own media must not destroy it for the receiver.
  assert.match(migration, /target\.sender_id = auth\.uid\(\)[\s\S]{0,120}'skipped', true/);
  assert.match(migration, /function public\.complete_attachment_purge/);

  // Client downloads first, then consumes, then deletes the object.
  assert.match(hook, /rpc\('consume_message_attachment'/);
  assert.match(hook, /from\('attachment_purge_queue'\)/);
  assert.match(hook, /rpc\('complete_attachment_purge'/);
  assert.match(bubble, /await onConsumeAttachment\?\.\(msg\.id\)/);
  assert.match(bubble, /link\.download = msg\.attachment_name/);

  // Every attachment kind gets its own status line.
  for (const label of [
    'Image deleted after download',
    'Video deleted after download',
    'Audio deleted after download',
    'File deleted after download'
  ]) {
    assert.match(attachments, new RegExp(label));
  }
  assert.match(bubble, /expiredAttachmentLabel\(expiredKind\)/);
  assert.match(bubble, /className="expired-attachment-note"/);
});

test('chat surfaces stay responsive from 320px to desktop', async () => {
  const [styles, main] = await Promise.all([
    read('web/src/chat-responsive.css'),
    read('web/src/main.jsx')
  ]);

  assert.match(main, /import '\.\/chat-responsive\.css'/);
  for (const query of ['(max-width: 768px)', '(max-width: 425px)', '(max-width: 360px)', '(min-width: 1600px)']) {
    assert.match(styles, new RegExp(query.replace(/[()]/g, '\\$&')));
  }
  // Contact name always survives narrow headers.
  assert.match(styles, /\.chat-header-details h3[\s\S]{0,200}text-overflow: ellipsis/);
  // Details panel becomes a full-height sheet on mobile.
  assert.match(styles, /\.chat-details-sidebar[\s\S]{0,200}position: fixed/);
  assert.match(styles, /env\(safe-area-inset-top/);
  assert.match(styles, /prefers-reduced-motion: reduce/);
});
