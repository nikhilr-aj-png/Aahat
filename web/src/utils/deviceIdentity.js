const browserNameFromUserAgent = (userAgent = '') => {
  if (/SamsungBrowser\//i.test(userAgent)) return 'Samsung Internet';
  if (/EdgA?\//i.test(userAgent)) return 'Edge';
  if (/OPR\//i.test(userAgent)) return 'Opera';
  if (/Firefox|FxiOS/i.test(userAgent)) return 'Firefox';
  if (/CriOS|Chrome/i.test(userAgent)) return 'Chrome';
  if (/Safari/i.test(userAgent)) return 'Safari';
  return 'Browser';
};

const androidModelFromUserAgent = (userAgent = '') => {
  const match = userAgent.match(/Android[^;)]*;\s*([^;)]+?)(?:\s+Build\/|;|\))/i);
  const model = match?.[1]?.trim();
  return model && !/^wv$/i.test(model) ? model : '';
};

const fallbackDeviceName = (userAgent = '') => {
  if (/iPad/i.test(userAgent)) return 'iPad';
  if (/iPhone/i.test(userAgent)) return 'iPhone';
  if (/Android/i.test(userAgent)) return androidModelFromUserAgent(userAgent) || (/Mobile/i.test(userAgent) ? 'Android phone' : 'Android tablet');
  if (/Windows/i.test(userAgent)) return 'Windows PC';
  if (/Macintosh|Mac OS X/i.test(userAgent)) return 'Mac';
  if (/CrOS/i.test(userAgent)) return 'Chromebook';
  if (/Linux/i.test(userAgent)) return 'Linux PC';
  return /Mobile/i.test(userAgent) ? 'Mobile device' : 'Computer';
};

export const isLegacyGenericDeviceName = value => /^(Win32|Win64|MacIntel|Linux(?:\s+armv\d+)?|Unknown device)(?:\s*·\s*(?:Browser|Mobile))?$/i.test(String(value || '').trim());

export async function getDeviceIdentity() {
  const userAgent = navigator.userAgent || '';
  const browser = browserNameFromUserAgent(userAgent);
  let model = '';
  let platform = '';

  try {
    if (navigator.userAgentData?.getHighEntropyValues) {
      const values = await navigator.userAgentData.getHighEntropyValues(['model', 'platform']);
      model = String(values.model || '').trim();
      platform = String(values.platform || '').trim();
    }
  } catch {
    // Client hints are optional. The user-agent fallback remains safe.
  }

  const device = model || fallbackDeviceName(userAgent);
  return {
    name: `${device} · ${browser}`,
    platform: platform || (/Android/i.test(userAgent) ? 'Android' : /Windows/i.test(userAgent) ? 'Windows' : /iPhone|iPad/i.test(userAgent) ? 'iOS' : /Mac/i.test(userAgent) ? 'macOS' : /Linux/i.test(userAgent) ? 'Linux' : 'Web')
  };
}
