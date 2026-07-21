import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('the flat pass is loaded last so it wins over the older card styles', async () => {
  const main = await read('web/src/main.jsx');
  const order = ['./index.css', './chat-responsive.css', './flat-ui.css']
    .map(name => main.indexOf(name));
  assert.ok(order.every(index => index > -1), 'all stylesheets are imported');
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'flat-ui.css is imported last');
});

test('settings sections are a column of groups on the page background, not cards', async () => {
  const flat = await read('web/src/flat-ui.css');

  assert.match(
    flat,
    /\.settings-panel \.settings-content > section \{[\s\S]{0,400}border: 0;[\s\S]{0,200}background: transparent;[\s\S]{0,120}box-shadow: none/
  );
  // Nested panels inside a section lose their outlines entirely.
  assert.match(flat, /\.settings-aahat-card,[\s\S]{0,600}border: 0;[\s\S]{0,160}background: transparent/);
  // Inputs keep an underline for affordance rather than a full box.
  assert.match(flat, /textarea,[\s\S]{0,200}border: 0;\s*\n\s*border-bottom: 1px solid/);
});

test('list surfaces use hairline separators instead of boxed rows', async () => {
  const flat = await read('web/src/flat-ui.css');

  assert.match(flat, /\.chat-item,[\s\S]{0,200}border: 0 !important;[\s\S]{0,200}background: transparent !important/);
  assert.match(flat, /\.chat-item \+ \.chat-item,[\s\S]{0,200}border-top: 1px solid var\(--flat-divider\)/);
});

test('panels that occlude another screen are never made transparent', async () => {
  const flat = await read('web/src/flat-ui.css');

  // Regression: .sidebar is a full-screen fixed overlay on mobile (z-index
  // 100) and .chat-details-sidebar is a fixed sheet (z-index 120). Setting
  // either to a transparent background lets the layer underneath — the chat
  // empty state — bleed through the conversation list.
  const withoutComments = flat.replace(/\/\*[\s\S]*?\*\//g, '');
  const transparentTargets = [...withoutComments.matchAll(/([^{}]+)\{[^{}]*background:\s*transparent[^{}]*\}/g)]
    .flatMap(match => match[1].split(',').map(selector => selector.trim()));

  for (const overlay of ['.sidebar', '.chat-details-sidebar', '.status-section']) {
    assert.ok(
      !transparentTargets.includes(overlay),
      `${overlay} must keep an opaque background — it covers another screen`
    );
  }
});

test('floating layers keep a surface so they still read as raised', async () => {
  const flat = await read('web/src/flat-ui.css');

  // Modals, dropdowns and menus must NOT be flattened away.
  assert.match(flat, /\.modal-card,[\s\S]{0,260}box-shadow: 0 18px 50px/);
  for (const selector of ['.chat-dropdown-menu', '.message-action-menu', '.camera-workspace']) {
    assert.ok(flat.includes(selector), `${selector} keeps its raised surface`);
  }
});

test('privacy and audience rows share one uniform shape', async () => {
  const [privacyCss, privacyJsx] = await Promise.all([
    read('web/src/components/PrivacySettingsSection.css'),
    read('web/src/components/PrivacySettingsSection.jsx')
  ]);

  // One row primitive drives switches, audience options, contacts and blocks.
  const rowUses = privacyJsx.match(/className="[^"]*settings-row/g) || [];
  assert.ok(rowUses.length >= 4, 'every list item uses the shared row primitive');

  // Rows are dividers, never cards.
  assert.match(privacyCss, /\.settings-row \{[\s\S]{0,600}border: 0;\s*\n\s*border-bottom: 1px solid/);
  assert.match(privacyCss, /\.settings-row:last-child \{\s*\n\s*border-bottom: 0/);
  assert.doesNotMatch(privacyCss, /border-radius: 1[0-9]px;[\s\S]{0,80}background: rgba\(255, 255, 255, \.0/);

  // The old nested panels are gone.
  for (const legacy of ['.privacy-switch-card', '.status-audience-panel', '.blocked-users-panel', '.audience-option-grid']) {
    assert.ok(!privacyCss.includes(legacy), `${legacy} no longer exists`);
    assert.ok(!privacyJsx.includes(legacy.slice(1)), `${legacy} is not referenced in markup`);
  }
});

test('the time format control is reachable from settings', async () => {
  const [preferences, settings] = await Promise.all([
    read('web/src/components/AppPreferencesSection.jsx'),
    read('web/src/components/SettingsPanelProduction.jsx')
  ]);

  assert.match(settings, /import AppPreferencesSection/);
  assert.match(settings, /<AppPreferencesSection \/>/);
  assert.match(preferences, /setTimeFormatPreference/);
  for (const label of ['Automatic', '12-hour', '24-hour']) {
    assert.ok(preferences.includes(label), `offers ${label}`);
  }
});
