import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('notification sound and previews are enforced in foreground and background delivery', async () => {
  const [app, settings, section, sectionCss, worker, push] = await Promise.all([
    read('web/src/App.jsx'),
    read('web/src/components/SettingsPanelProduction.jsx'),
    read('web/src/components/NotificationSettingsSection.jsx'),
    read('web/src/components/NotificationSettingsSection.css'),
    read('web/public/sw.js'),
    read('supabase/functions/send-message-push/index.ts')
  ]);
  assert.match(settings, /<NotificationSettingsSection/);
  assert.match(section, /notification-action-row/);
  assert.match(sectionCss, /grid-template-columns: 1fr 1fr/);
  assert.match(sectionCss, /grid-auto-rows: 1fr/);
  assert.match(sectionCss, /min-height: 126px/);
  assert.match(sectionCss, /notification-settings-section > \.notification-settings-grid/);
  assert.match(app, /notificationSettings\.previews !== false/);
  assert.match(app, /notificationSettings\.sound !== false/);
  assert.match(app, /playNotificationChime/);
  assert.match(app, /silent: !soundEnabled/);
  assert.match(push, /notification_settings/);
  assert.match(push, /previewsEnabled/);
  assert.match(worker, /soundEnabled === 'false'/);
});
