import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

// The module reads localStorage/window at call time, so a minimal stub is
// enough to exercise the real formatting logic rather than a grep.
const store = new Map();
globalThis.localStorage = {
  getItem: key => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: key => store.delete(key)
};
const listeners = new Map();
globalThis.window = {
  dispatchEvent: event => (listeners.get(event.type) || []).forEach(fn => fn(event)),
  addEventListener: (type, fn) => listeners.set(type, [...(listeners.get(type) || []), fn]),
  removeEventListener: (type, fn) => listeners.set(type, (listeners.get(type) || []).filter(x => x !== fn))
};
globalThis.CustomEvent = class extends Event {
  constructor(type, options = {}) { super(type); this.detail = options.detail; }
};

const {
  formatDeviceTime, setTimeFormatPreference, getTimeFormatPreference,
  isDevice24HourClock, onTimeFormatChange
} = await import('../web/src/utils/dateTime.js');

const AFTERNOON = new Date(2026, 6, 21, 13, 40, 0);
const MORNING = new Date(2026, 6, 21, 9, 5, 0);

test('an explicit 12-hour preference overrides a 24-hour device locale', () => {
  setTimeFormatPreference('12');
  assert.equal(getTimeFormatPreference(), '12');
  assert.equal(isDevice24HourClock(), false);
  // 1:40 PM / 1:40 pm depending on locale — the point is it is not 13:40.
  const formatted = formatDeviceTime(AFTERNOON);
  assert.match(formatted, /1:40/);
  assert.doesNotMatch(formatted, /13:40/);
});

test('an explicit 24-hour preference renders a padded 24-hour clock', () => {
  setTimeFormatPreference('24');
  assert.equal(isDevice24HourClock(), true);
  assert.equal(formatDeviceTime(AFTERNOON), '13:40');
  // 24-hour clocks pad the hour so the column stays aligned.
  assert.equal(formatDeviceTime(MORNING), '09:05');
});

test('automatic follows the locale convention', () => {
  setTimeFormatPreference('auto');
  assert.equal(getTimeFormatPreference(), 'auto');
  const localeIs24 = !new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hour12;
  assert.equal(isDevice24HourClock(), localeIs24);
});

test('switching the preference notifies listeners so timestamps restamp', () => {
  setTimeFormatPreference('auto');
  let notified = 0;
  const unsubscribe = onTimeFormatChange(() => { notified += 1; });
  setTimeFormatPreference('24');
  setTimeFormatPreference('12');
  unsubscribe();
  setTimeFormatPreference('24');
  assert.equal(notified, 2, 'listener fires while subscribed and stops after unsubscribe');
});

test('invalid values fall back to automatic and bad dates render empty', () => {
  setTimeFormatPreference('nonsense');
  assert.equal(getTimeFormatPreference(), 'auto');
  assert.equal(formatDeviceTime(null), '');
  assert.equal(formatDeviceTime('not-a-date'), '');
});

test('every timestamp surface goes through the shared formatter', async () => {
  const [bubble, chat, status, conversations] = await Promise.all([
    read('web/src/components/MessageBubble.jsx'),
    read('web/src/components/ChatView.jsx'),
    read('web/src/components/StatusSection.jsx'),
    read('web/src/hooks/useConversations.js')
  ]);
  for (const source of [bubble, chat, status, conversations]) {
    assert.match(source, /formatDeviceTime/);
    // No surface may format a clock time on its own.
    assert.doesNotMatch(source, /toLocaleTimeString/);
  }
  // The memoised bubble is busted on change so on-screen times restamp.
  assert.match(bubble, /timeFormatRevision/);
});
