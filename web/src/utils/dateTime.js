let formatterCache = null;
let formatterSignature = '';

// Some platforms (Android/Chrome, Windows) report the OS 24-hour preference
// through the resolved hourCycle rather than through the locale alone, so the
// cycle is resolved explicitly and fed back into the formatter. h23/h24 also
// force 2-digit hours so 24-hour clocks read 09:05 instead of 9:05.
const resolveDeviceHourCycle = () => {
  const resolved = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions();
  if (resolved.hourCycle) return resolved.hourCycle;
  return resolved.hour12 === false ? 'h23' : 'h12';
};

const getDeviceTimeFormatter = () => {
  const resolved = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions();
  const hourCycle = resolveDeviceHourCycle();
  const signature = `${resolved.locale}|${resolved.calendar}|${resolved.numberingSystem}|${hourCycle}`;
  if (!formatterCache || formatterSignature !== signature) {
    const is24Hour = hourCycle === 'h23' || hourCycle === 'h24';
    formatterSignature = signature;
    formatterCache = new Intl.DateTimeFormat(undefined, {
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

/** True when the device clock is set to a 24-hour format (13:40 instead of 1:40 PM). */
export function isDevice24HourClock() {
  const hourCycle = resolveDeviceHourCycle();
  return hourCycle === 'h23' || hourCycle === 'h24';
}

export function formatDeviceTime(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return getDeviceTimeFormatter().format(date);
}
