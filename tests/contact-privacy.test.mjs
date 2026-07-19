import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('selected status audiences are persisted and enforced by RLS', async () => {
  const [migration, hook, status, privacy, privacyCss] = await Promise.all([
    read('supabase/migrations/20260718_contact_privacy_and_status_audience.sql'),
    read('web/src/hooks/useStatuses.js'),
    read('web/src/components/StatusSection.jsx'),
    read('web/src/components/PrivacySettingsSection.jsx'),
    read('web/src/components/PrivacySettingsSection.css')
  ]);
  assert.match(migration, /create table if not exists public\.status_audience_members/);
  assert.match(migration, /function public\.can_view_status/);
  assert.match(migration, /p_privacy = 'selected'[\s\S]+status_audience_members/);
  assert.match(migration, /function public\.create_aahat_status/);
  assert.match(migration, /Status audience can only include accepted contacts/);
  assert.match(hook, /rpc\('create_aahat_status'/);
  assert.doesNotMatch(hook, /from\('statuses'\)\s*\.insert\(/);
  assert.match(status, /p_selected_contact_ids|selectedStatusContacts/);
  assert.match(privacy, /status_members/);
  assert.match(privacy, /Only people you choose/);
  assert.doesNotMatch(privacy, /label: 'Only me'/);
  assert.match(privacy, /status: 'contacts'/);
  assert.match(privacyCss, /\.member-picker-list \{[^}]*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)[^}]*max-height: 128px/);
  assert.match(privacyCss, /max-height: 128px/);
  assert.match(privacyCss, /overflow-y: auto/);
  assert.match(privacyCss, /@media \(max-width: 860px\)[\s\S]+grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)[\s\S]+max-height: 128px/);
  assert.match(privacyCss, /@media \(max-width: 520px\)[\s\S]+grid-template-columns: 1fr[\s\S]+max-height: 128px/);
  assert.doesNotMatch(privacyCss, /\.member-picker-list \{ grid-template-columns: repeat\(2,[^}]+max-height: 196px/);
});

test('public Aahat ID connections are atomic while private profiles require PIN and approval', async () => {
  const [migration, hook, app, privacy, settings] = await Promise.all([
    read('supabase/migrations/20260718_contact_privacy_and_status_audience.sql'),
    read('web/src/hooks/useAahatContacts.js'),
    read('web/src/App.jsx'),
    read('web/src/components/PrivacySettingsSection.jsx'),
    read('web/src/components/SettingsPanelProduction.jsx')
  ]);
  assert.match(migration, /function public\.connect_by_aahat_id/);
  assert.match(migration, /target_mode = 'private'[\s\S]+6-digit PIN/);
  assert.match(migration, /target_mode = 'public'[\s\S]+insert into public\.user_contacts[\s\S]+get_or_create_direct_conversation/);
  assert.match(hook, /rpc\('connect_by_aahat_id_private_safe'/);
  assert.match(app, /result\?\.conversation_id[\s\S]+handleSelectConversation/);
  assert.match(app, /Public profiles open instantly/);
  assert.match(app, /Private profile found/);
  assert.match(app, /Send invitation/);
  assert.doesNotMatch(privacy, /aahat_connection_mode/);
  assert.match(settings, /aahat_connection_mode/);
  assert.match(settings, /Public .* instant chat/);
  assert.match(settings, /!publicConnections &&/);
});

test('contact removal is bilateral, transactional and exposed through a confirmed three-dot action', async () => {
  const [migration, hook, contacts] = await Promise.all([
    read('supabase/migrations/20260718_contact_privacy_and_status_audience.sql'),
    read('web/src/hooks/useAahatContacts.js'),
    read('web/src/components/ContactsSection.jsx')
  ]);
  assert.match(migration, /function public\.remove_contact_for_both/);
  assert.match(migration, /delete from public\.conversations/);
  assert.match(migration, /delete from public\.contact_requests/);
  assert.match(migration, /delete from public\.user_contacts[\s\S]+owner_id = caller_id[\s\S]+owner_id = p_contact_id/);
  assert.match(hook, /rpc\('remove_contact_for_both'/);
  assert.match(hook, /table: 'user_contacts'/);
  assert.match(contacts, /MoreVertical/);
  assert.match(contacts, /Remove for both/);
  assert.match(contacts, /aria-modal="true"/);
});
