import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './design-tokens.css'
import './index.css'
import './clock-integrity.css'
import './resonance.css'
import './settings-professional.css'
import './aahat-contacts.css'
import './chat-responsive.css'
import './glass-ui.css'
import './premium-chat-list.css'
import App from './App.jsx'
import TouchRefreshGesture from './components/TouchRefreshGesture.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import ClockIntegrityGate from './components/ClockIntegrityGate.jsx'
import { applyInstalledPwaOrientation } from './utils/pwaOrientation.js'
import { refreshDeviceTimeFormat } from './utils/dateTime.js'

// Dev-only design preview: /?preview=chats|chat|privacy|preferences renders the
// real screen components against fixture data so they can be measured at every
// breakpoint without a Supabase session. import.meta.env.DEV is statically
// false in a production build, so this branch and its imports are tree-shaken.
const previewScreen = import.meta.env.DEV
  ? new URLSearchParams(window.location.search).get('preview')
  : null;

if (previewScreen) {
  const { default: DesignPreview } = await import('./dev/DesignPreview.jsx');
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <ErrorBoundary>
        <DesignPreview screen={previewScreen} />
      </ErrorBoundary>
    </StrictMode>,
  );
} else {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <ErrorBoundary>
        <>
          <TouchRefreshGesture />
          <ClockIntegrityGate>
            <App />
          </ClockIntegrityGate>
        </>
      </ErrorBoundary>
    </StrictMode>,
  )
}
const syncInstalledOrientation = () => {
  void applyInstalledPwaOrientation();
};

syncInstalledOrientation();
window.addEventListener('pageshow', () => {
  refreshDeviceTimeFormat();
  syncInstalledOrientation();
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    refreshDeviceTimeFormat();
    syncInstalledOrientation();
  }
});


// Register the production PWA worker only in production. A service worker on
// localhost can keep old CSS/JS alive and make visual fixes appear stale.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    if (import.meta.env.PROD) {
      navigator.serviceWorker.register('/sw.js')
        .catch((err) => console.error('PWA Service Worker registration failed:', err));
      return;
    }

    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
    if ('caches' in window) {
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name.startsWith('aahat-')).map((name) => caches.delete(name)));
    }
  });
}
