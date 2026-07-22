import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const contacts = read('web/src/components/ContactsSection.jsx');
const actionsCss = read('web/src/components/ContactActions.css');
const hook = read('web/src/hooks/useAahatContacts.js');
const app = read('web/src/App.jsx');
const migration = read('supabase/migrations/202607190003_contact_block_and_private_discovery.sql');

test('contact menu closes outside and stays usable on a narrow card', () => {
  assert.match(contacts, /document\.addEventListener\('pointerdown', closeOutside\)/);
  assert.match(contacts, /event\.target\.closest\('\.contact-menu-trigger, \.contact-menu-popover'\)/);
  assert.match(contacts, /event\.key === 'Escape'/);

  // The menu used to be `position: static` under 520px, which kept it in the
  // card's flow while the card wrapped onto two lines. The contact row is now
  // a single compact line that does not wrap, so a static child would be laid
  // out inline beside the avatar. It stays absolute and is instead constrained
  // to the card width so it cannot overflow a 320px screen.
  assert.match(actionsCss, /@media \(max-width: 520px\)[\s\S]+\.contact-menu-popover \{[^}]*width: calc\(100% - 16px\)/);

  // Regression: the glass pass gives each card a backdrop-filter, which makes
  // it a stacking context and traps the popover's z-index inside it — the next
  // contact row then paints over the open menu. The CARD has to be raised.
  assert.match(actionsCss, /\.aahat-contact-card:has\(\.contact-menu-popover\) \{ z-index: \d+/);
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
