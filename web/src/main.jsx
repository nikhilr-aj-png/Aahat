import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './resonance.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

// Register PWA Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(() => {})
      .catch((err) => console.error('PWA Service Worker registration failed:', err));
  });
}
