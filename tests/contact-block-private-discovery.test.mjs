import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const contacts = read('web/src/components/ContactsSection.jsx');
const actionsCss = read('web/src/components/ContactActions.css');
const hook = read('web/src/hooks/useAahatContacts.js');
const app = read('web/src/App.jsx');
const migration = read('supabase/migrations/202607190003_contact_block_and_private_discovery.sql');

test('contact menu closes outside and stays in mobile card flow', () => {
  assert.match(contacts, /document\.addEventListener\('pointerdown', closeOutside\)/);
  assert.match(contacts, /event\.target\.closest\('\.contact-menu-trigger, \.contact-menu-popover'\)/);
  assert.match(contacts, /event\.key === 'Escape'/);
  assert.match(actionsCss, /@media \(max-width: 520px\)[\s\S]+\.contact-menu-popover \{ position: static/);
});

test('block is atomic and blocked Aahat IDs stay undiscoverable', () => {
  assert.match(contacts, /Block & remove/);
  assert.match(hook, /rpc\('block_and_remove_contact'/);
  assert.match(migration, /insert into public\.blocked_users[\s\S]+remove_contact_for_both/);
  assert.match(migration, /b\.blocker_id = p\.id and b\.blocked_id = auth\.uid\(\)/);
  assert.match(migration, /revoke all on function public\.connect_by_aahat_id\(text, text\) from anon, authenticated/);
});

test('private invitation identity is always represented as Aahat', () => {
  assert.match(hook, /connect_by_aahat_id_private_safe/);
  assert.doesNotMatch(hook, /recipient:profiles!/);
  assert.match(app, /connect-id-summary"><img src="\/logo\.png"[\s\S]+<strong>Aahat<\/strong>/);
  assert.match(contacts, /<SafeAvatar src="\/logo\.png" name="Aahat"/);
  assert.match(migration, /connection_mode = 'private' then 'Aahat'/);
  assert.match(migration, /connection_mode = 'private' then '\/logo\.png'/);
});
