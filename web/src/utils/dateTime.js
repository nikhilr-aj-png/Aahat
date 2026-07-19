let formatterCache = null;
let formatterSignature = '';

const getDeviceTimeFormatter = () => {
  const resolved = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions();
  const signature = `${resolved.locale}|${resolved.calendar}|${resolved.numberingSystem}|${resolved.hourCycle || ''}`;
  if (!formatterCache || formatterSignature !== signature) {
    formatterSignature = signature;
    formatterCache = new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit'
    });
  }
  return formatterCache;
};

export function refreshDeviceTimeFormat() {
  formatterCache = null;
  formatterSignature = '';
}

export function formatDeviceTime(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return getDeviceTimeFormatter().format(date);
}
