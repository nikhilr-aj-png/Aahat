import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/**
 * Contract for the glass surface pass.
 *
 * Replaces the earlier flat-surface test. The design direction inverted —
 * Stitch is glassmorphic — but two of the old assertions were guarding real
 * bugs rather than the flat aesthetic, and they are carried over verbatim:
 * full-screen overlays must stay opaque, and floating layers must stay
 * raised. Those cases are marked below.
 */

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const stripComments = css => css.replace(/\/\*[\s\S]*?\*\//g, '');

test('the glass pass is loaded after the stylesheets it overrides', async () => {
  const main = await read('web/src/main.jsx');
  const order = ['./index.css', './chat-responsive.css', './glass-ui.css']
    .map(name => main.indexOf(name));

  assert.ok(order.every(index => index > -1), 'all stylesheets are imported');
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'glass-ui.css is imported last');
  assert.ok(!main.includes('flat-ui.css'), 'the retired flat pass is no longer imported');
});

test('the glass recipe is defined once, as tokens', async () => {
  const tokens = await read('web/src/design-tokens.css');

  for (const token of [
    '--glass-bg:', '--glass-bg-heavy:', '--glass-blur:', '--glass-blur-heavy:',
    '--glass-border:', '--glow-accent:', '--radius-card:'
  ]) {
    assert.ok(tokens.includes(token), `${token} is defined`);
  }

  // The values Stitch uses across every screen.
  assert.match(tokens, /--glass-bg:\s*rgba\(28, 21, 69, 0\.6\)/);
  assert.match(tokens, /--glass-blur:\s*blur\(16px\)/);
});

test('screens reach for the tokens instead of re-typing the rgba', async () => {
  const glass = stripComments(await read('web/src/glass-ui.css'));

  // The one glass fill colour must never be spelled out in a screen rule;
  // that is how the recipe drifts between screens.
  assert.doesNotMatch(glass, /background:\s*rgba\(28, 21, 69/);
  assert.match(glass, /background: var\(--glass-bg\)/);
});

test('list surfaces and settings groups are glass cards', async () => {
  const [glass, privacy] = await Promise.all([
    read('web/src/glass-ui.css'),
    read('web/src/components/PrivacySettingsSection.css')
  ]);

  // Conversation rows, contacts and status rows are cards, not hairlines.
  assert.match(
    glass,
    /\.chat-item,[\s\S]{0,240}background: var\(--glass-bg\) !important;[\s\S]{0,160}backdrop-filter: var\(--glass-blur\)/
  );
  // The divider index.css draws under each row is redundant once they are cards.
  assert.match(glass, /\.chat-item::after \{\s*\n\s*display: none/);

  // The GROUP is the card; the rows inside it stay dividers.
  assert.match(
    privacy,
    /\.settings-list-group \{[\s\S]{0,400}border-radius: var\(--radius-card[\s\S]{0,120}background: var\(--glass-bg\)/
  );
  assert.match(
    privacy,
    /\.settings-panel \.settings-content \.settings-row \{[\s\S]{0,600}border: 0;\s*\n\s*border-bottom: 1px solid/
  );
});

test('panels that occlude another screen are never made transparent', async () => {
  // CARRIED OVER FROM THE FLAT PASS — this is a bug guard, not a style rule.
  // .sidebar is a full-screen fixed overlay on mobile (z-index 100) and
  // .chat-details-sidebar is a fixed sheet (z-index 120). Giving either a
  // transparent or translucent background lets the layer underneath — the
  // chat empty state — bleed through the conversation list.
  const glass = stripComments(await read('web/src/glass-ui.css'));

  const rules = [...glass.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  const translucentTargets = rules
    .filter(([, , body]) => /background:\s*(transparent|var\(--glass-bg)/.test(body))
    .flatMap(([, selectors]) => selectors.split(',').map(selector => selector.trim()));

  for (const overlay of ['.sidebar', '.chat-details-sidebar', '.status-section']) {
    assert.ok(
      !translucentTargets.includes(overlay),
      `${overlay} must keep an opaque background — it covers another screen`
    );
  }
});

test('floating layers use the heavier glass so they still read as raised', async () => {
  const glass = await read('web/src/glass-ui.css');

  assert.match(
    glass,
    /\.modal-card,[\s\S]{0,320}background: var\(--glass-bg-heavy\);[\s\S]{0,200}box-shadow: 0 18px 50px/
  );
  for (const selector of ['.chat-dropdown-menu', '.message-action-menu', '.camera-workspace']) {
    assert.ok(glass.includes(selector), `${selector} keeps its raised surface`);
  }
});

test('glass degrades to a solid surface when transparency is unwanted or unsupported', async () => {
  const tokens = await read('web/src/design-tokens.css');

  // Users who ask for reduced transparency, and engines without
  // backdrop-filter, must still get a readable opaque panel.
  assert.match(tokens, /@media \(prefers-reduced-transparency: reduce\)[\s\S]{0,300}--glass-bg:\s*#1C1545/);
  assert.match(tokens, /@supports not \(backdrop-filter: blur\(1px\)\)[\s\S]{0,220}--glass-bg:\s*#1C1545/);
});

test('the selected conversation is styled under the class the markup emits', async () => {
  // Regression: the flat pass styled `.chat-item.active`, but Sidebar.jsx has
  // always rendered `chat-item selected`, so the selected row never changed.
  const [sidebar, glass] = await Promise.all([
    read('web/src/components/Sidebar.jsx'),
    read('web/src/glass-ui.css')
  ]);

  assert.match(sidebar, /isSelected \? 'selected' : ''/);
  assert.match(glass, /\.chat-item\.selected/);
});

test('the mobile nav is a floating pill and clears the content behind it', async () => {
  const glass = await read('web/src/glass-ui.css');

  assert.match(glass, /\.mobile-bottom-nav \{[\s\S]{0,500}border-radius: var\(--radius-pill\)/);
  // The FAB and the list padding must both be derived from the same nav
  // height, or one of them will overlap the pill.
  assert.match(glass, /\.mobile-fab \{[\s\S]{0,400}bottom: calc\(var\(--space-6\) \+ 68px/);
  assert.match(glass, /\.sidebar,[\s\S]{0,200}padding-bottom: calc\(var\(--space-6\) \+ 68px/);
});

test('text stays at or above the 12px readability floor', async () => {
  // The glass pass raised the settings and nav labels that were below it.
  const files = await Promise.all([
    read('web/src/components/PrivacySettingsSection.css'),
    read('web/src/components/SecurityAuth.css'),
    read('web/src/glass-ui.css')
  ]);

  for (const css of files) {
    const tooSmall = [...stripComments(css).matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)]
      .map(match => Number(match[1]))
      .filter(size => size < 12);
    assert.deepEqual(tooSmall, [], 'no font-size below 12px');
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
