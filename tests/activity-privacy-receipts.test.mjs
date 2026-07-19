import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const migration = read('supabase/migrations/202607190004_activity_privacy_and_read_receipts.sql');
const presence = read('web/src/hooks/usePresence.js');
const auth = read('web/src/hooks/useAuth.js');
const app = read('web/src/App.jsx');
const chat = read('web/src/components/ChatView.jsx');
const settings = read('web/src/components/PrivacySettingsSection.jsx');

test('activity privacy preferences are owner-protected and contact-scoped', () => {
  assert.match(migration, /create table if not exists public\.user_activity_privacy/);
  assert.match(migration, /activity_privacy_select_own[\s\S]+user_id = auth\.uid\(\)/);
  assert.match(migration, /function public\.get_visible_contact_activity/);
  assert.match(migration, /contacts\.owner_id = auth\.uid\(\)[\s\S]+contacts\.status = 'accepted'/);
  assert.match(migration, /activity\.show_online and is_contact and not is_blocked/);
  assert.match(migration, /activity\.show_last_seen and is_contact and not is_blocked/);
});

test('online status stops broadcasting and last seen is permission gated', () => {
  assert.match(settings, /\['online', 'Show online status'/);
  assert.match(settings, /\['last_seen', 'Show last seen'/);
  assert.match(presence, /onlineSharingEnabled = profile\?\.privacy_settings\?\.online !== false/);
  assert.match(presence, /if \(!userId \|\| !onlineSharingEnabled\)/);
  assert.match(presence, /get_visible_contact_activity/);
  assert.match(presence, /visible\?\.show_last_seen === true/);
  assert.match(presence, /canViewOnlineStatus/);
  assert.match(auth, /onlineSharingEnabled && navigator\.onLine/);
  assert.match(app, /getLastSeen=\{getLastSeen\}/);
  assert.match(app, /canViewOnlineStatus=\{canViewOnlineStatus\}/);
  assert.match(chat, /Last seen \$\{day\} at \$\{time\}/);
  assert.match(chat, /return onlineStatusVisible \? 'Offline' : ''/);
  assert.match(chat, /onlineStatusVisible \? `Offline · \$\{lastSeenText\}` : lastSeenText/);
  assert.match(chat, /canViewOnlineStatus\?\.\(conversation\.otherMemberId\)/);
});

test('read receipts off keeps delivery and unread clearing without blue ticks', () => {
  assert.match(settings, /\['read_receipts', 'Read receipts'/);
  assert.match(migration, /select coalesce\(activity\.read_receipts, true\)/);
  assert.match(migration, /case when receipts_enabled then 'read' else 'delivered' end/);
  assert.match(migration, /when receipts_enabled then 'read'[\s\S]+else 'delivered'/);
  assert.match(migration, /set unread_count = 0, last_read_at = now\(\)/);
});
