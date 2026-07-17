import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('avatar storage policies scope writes to the authenticated user folder', async () => {
  const migration = await readFile(
    new URL('../supabase/migrations/20260717_avatar_storage_policies.sql', import.meta.url),
    'utf8'
  );
  assert.match(migration, /avatars_owner_insert/i);
  assert.match(migration, /avatars_owner_update/i);
  assert.match(migration, /avatars_owner_delete/i);
  assert.match(migration, /split_part\(name, '\/', 1\) = auth\.uid\(\)::text/i);
  assert.match(migration, /file_size_limit = excluded\.file_size_limit/i);
});
