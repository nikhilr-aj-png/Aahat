import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Aahat IDs stay stable and direct table-write bypasses are closed', async () => {
  const migration = await readFile(
    new URL('../supabase/migrations/20260716_aahat_id_pin_invitations.sql', import.meta.url),
    'utf8'
  );
  assert.match(migration, /prevent_aahat_id_change/i);
  assert.match(migration, /before update of virtual_number on public\.profiles/i);
  assert.match(migration, /revoke insert on public\.conversations from authenticated/i);
  assert.match(migration, /revoke insert on public\.conversation_members from authenticated/i);
});
