import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('profile avatar editor replaces and removes managed Supabase files', async () => {
  const settings = await readFile(
    new URL('../web/src/components/SettingsPanelProduction.jsx', import.meta.url),
    'utf8'
  );
  assert.match(settings, /<Pencil size=\{15\}\/>Edit/);
  assert.match(settings, /<ImagePlus size=\{16\}\/>Choose photo/);
  assert.match(settings, /<Trash2 size=\{16\}\/>Remove photo/);
  assert.match(settings, /storage\.from\('avatars'\)\.upload/);
  assert.match(settings, /managedAvatarPath\(avatarUrl, user\.id\)/);
  assert.match(settings, /storage\.from\('avatars'\)\.remove\(\[oldPath\]\)/);
  assert.match(settings, /onUpdateProfile\(\{ avatar_url: '' \}\)/);
  assert.match(settings, /accept="image\/jpeg,image\/png,image\/webp,image\/gif"/);
});
