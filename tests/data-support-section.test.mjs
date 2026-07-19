import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Data and support uses a compact secure workflow for export, support and deletion', async () => {
  const [settings, section, css, deletion] = await Promise.all([
    read('web/src/components/SettingsPanelProduction.jsx'),
    read('web/src/components/DataSupportSection.jsx'),
    read('web/src/components/DataSupportSection.css'),
    read('supabase/functions/delete-account/index.ts')
  ]);
  assert.match(settings, /<DataSupportSection/);
  assert.match(settings, /messages: messages\.data/);
  assert.match(settings, /calls: calls\.data/);
  assert.match(section, /DELETE MY AAHAT ACCOUNT/);
  assert.match(section, /maxLength=\{120\}/);
  assert.match(section, /maxLength=\{2000\}/);
  assert.match(css, /data-media-grid/);
  assert.match(css, /width: min\(100%, 1040px\)/);
  assert.match(deletion, /auth\.admin\.deleteUser\(user\.id, false\)/);
});
