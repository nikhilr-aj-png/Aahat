import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Aahat credentials are fixed-length and owner-only', async () => {
  const migration = await read('supabase/migrations/20260716_aahat_id_pin_invitations.sql');
  assert.match(migration, /pin_code\s+text\s+not null check \(pin_code ~ '\^\\d\{6\}\$'\)/i);
  assert.match(migration, /aahat_credentials_owner_select[\s\S]+user_id = auth\.uid\(\)/i);
  assert.match(migration, /Too many attempts\. Try again in 15 minutes/i);
});

test('Aahat invitation acceptance gates direct conversations', async () => {
  const migration = await read('supabase/migrations/20260716_aahat_id_pin_invitations.sql');
  assert.match(migration, /request_contact_by_aahat_credentials/i);
  assert.match(migration, /respond_to_contact_request/i);
  assert.match(migration, /Contact invitation must be accepted first/i);
  assert.match(migration, /insert into public\.user_contacts[\s\S]+status = 'accepted'/i);
  assert.match(migration, /responded_at = now\(\)[\s\S]+get_or_create_direct_conversation/i);
});

test('web UI uses PIN invitations instead of starting a chat from an ID', async () => {
  const [app, hook, settings] = await Promise.all([
    read('web/src/App.jsx'),
    read('web/src/hooks/useAahatContacts.js'),
    read('web/src/components/SettingsPanelProduction.jsx')
  ]);
  assert.match(app, /requestContact\(newChatId, newChatPin\)/);
  assert.doesNotMatch(app, /startDirectChatByVirtualNumber/);
  assert.match(hook, /request_contact_by_aahat_credentials/);
  assert.match(hook, /respond_to_contact_request/);
  assert.match(settings, /Your 10-digit Aahat ID/);
  assert.match(settings, /Your 6-digit connection PIN/);
});

test('accepted invitations refresh contacts on both devices', async () => {
  const hook = await read('web/src/hooks/useAahatContacts.js');
  assert.match(
    hook,
    /contact_requests'[\s\S]+Promise\.all\(\[[\s\S]+refresh\(\)[\s\S]+onContactsChanged\?\.\(\)/
  );
  assert.match(hook, /\[user, refresh, onContactsChanged\]/);
});

test('accepted contacts can read their direct conversation without recursive RLS', async () => {
  const migration = await read('supabase/migrations/20260717_fix_conversation_member_rls.sql');
  assert.match(migration, /function public\.is_conversation_member\(p_conversation_id uuid\)/i);
  assert.match(migration, /security definer/i);
  assert.match(
    migration,
    /policy "conv_members_select"[\s\S]+is_conversation_member\(conversation_id\)/i
  );
  assert.doesNotMatch(migration, /conv_members_select[\s\S]+conversation_id in\s*\(\s*select[\s\S]+conversation_members/i);
});
