const TABLET_UA_PATTERN = /iPad|Tablet|PlayBook|Silk/i;

export function isTabletDevice() {
  const userAgent = navigator.userAgent || '';
  const touchPoints = navigator.maxTouchPoints || 0;
  const isIPadDesktopMode = /Macintosh/i.test(userAgent) && touchPoints > 1;
  const isAndroidTablet = /Android/i.test(userAgent) && !/Mobile/i.test(userAgent);
  const smallestScreenSide = Math.min(window.screen.width, window.screen.height);
  const largestScreenSide = Math.max(window.screen.width, window.screen.height);
  const hasCoarsePointer = window.matchMedia?.('(pointer: coarse)').matches === true;
  const isTabletSizedTouchscreen = touchPoints > 0
    && hasCoarsePointer
    && smallestScreenSide >= 600
    && largestScreenSide <= 1600;

  return TABLET_UA_PATTERN.test(userAgent)
    || isIPadDesktopMode
    || isAndroidTablet
    || isTabletSizedTouchscreen;
}

function isInstalledPwa() {
  return window.matchMedia?.('(display-mode: standalone)').matches === true
    || window.navigator.standalone === true;
}

export async function applyInstalledPwaOrientation() {
  if (!isInstalledPwa() || typeof window.screen.orientation?.lock !== 'function') return;

  try {
    await window.screen.orientation.lock(isTabletDevice() ? 'landscape' : 'portrait');
  } catch {
    // Some browsers and operating systems intentionally ignore orientation
    // locking. The matching device manifest remains the default fallback.
  }
}
