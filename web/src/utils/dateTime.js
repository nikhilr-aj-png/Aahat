let formatterCache = null;
let formatterSignature = '';

const PREFERENCE_KEY = 'aahat.timeFormat';
const PREFERENCE_EVENT = 'aahat:time-format-changed';
const VALID_PREFERENCES = ['auto', '12', '24'];

/**
 * How the clock is chosen.
 *
 * The web platform exposes no API for the operating system's 24-hour toggle —
 * `Intl` only reports what the *locale* conventionally uses. A phone set to a
 * 12-hour clock while running an en-GB locale therefore still resolves to h23.
 * So 'auto' follows the locale, and an explicit preference overrides it.
 */
export function getTimeFormatPreference() {
  if (typeof localStorage === 'undefined') return 'auto';
  const stored = localStorage.getItem(PREFERENCE_KEY);
  return VALID_PREFERENCES.includes(stored) ? stored : 'auto';
}

export function setTimeFormatPreference(preference) {
  const next = VALID_PREFERENCES.includes(preference) ? preference : 'auto';
  if (typeof localStorage !== 'undefined') localStorage.setItem(PREFERENCE_KEY, next);
  refreshDeviceTimeFormat();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(PREFERENCE_EVENT, { detail: next }));
  }
  return next;
}

/** Subscribes to preference changes so already-rendered timestamps re-render. */
export function onTimeFormatChange(listener) {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(PREFERENCE_EVENT, listener);
  return () => window.removeEventListener(PREFERENCE_EVENT, listener);
}

const localeHourCycle = () => {
  const resolved = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions();
  if (resolved.hourCycle) return resolved.hourCycle;
  return resolved.hour12 === false ? 'h23' : 'h12';
};

const resolveHourCycle = () => {
  const preference = getTimeFormatPreference();
  if (preference === '12') return 'h12';
  if (preference === '24') return 'h23';
  return localeHourCycle();
};

const getDeviceTimeFormatter = () => {
  const resolved = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions();
  const hourCycle = resolveHourCycle();
  const signature = `${resolved.locale}|${resolved.calendar}|${resolved.numberingSystem}|${hourCycle}`;
  if (!formatterCache || formatterSignature !== signature) {
    const is24Hour = hourCycle === 'h23' || hourCycle === 'h24';
    formatterSignature = signature;
    formatterCache = new Intl.DateTimeFormat(undefined, {
      // 24-hour clocks pad the hour (09:05); 12-hour clocks do not (9:05 AM).
      hour: is24Hour ? '2-digit' : 'numeric',
      minute: '2-digit',
      hourCycle
    });
  }
  return formatterCache;
};

export function refreshDeviceTimeFormat() {
  formatterCache = null;
  formatterSignature = '';
}

/** True when times currently render as 13:40 rather than 1:40 PM. */
export function isDevice24HourClock() {
  const hourCycle = resolveHourCycle();
  return hourCycle === 'h23' || hourCycle === 'h24';
}

/** A sample of the current format, for showing in the settings control. */
export function sampleDeviceTime() {
  const sample = new Date();
  sample.setHours(13, 40, 0, 0);
  return formatDeviceTime(sample);
}

export function formatDeviceTime(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return getDeviceTimeFormatter().format(date);
}
