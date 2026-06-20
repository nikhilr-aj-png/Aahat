import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

/**
 * ErrorBoundary — Catches rendering errors in child components
 * and presents a beautifully styled fallback screen.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          height: '100vh', padding: '24px', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', color: 'white',
          textAlign: 'center', fontFamily: 'system-ui, sans-serif'
        }}>
          <div style={{
            background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.15)',
            borderRadius: '16px', padding: '32px', maxWidth: '400px', display: 'flex',
            flexDirection: 'column', alignItems: 'center', gap: '16px', boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
            backdropFilter: 'blur(12px)'
          }}>
            <AlertTriangle size={48} style={{ color: '#ef4444' }} />
            <h2 style={{ fontSize: '20px', fontWeight: '700', margin: 0 }}>Something went wrong</h2>
            <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0, lineHeight: 1.5 }}>
              Aahat encountered an unexpected error. You can try refreshing the page to restart the application session.
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px',
                background: 'linear-gradient(135deg, #4f46e5 0%, #06b6d4 100%)', border: 'none', color: 'white',
                borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '13px',
                boxShadow: '0 4px 12px rgba(79, 70, 229, 0.3)', transition: 'transform 0.2s'
              }}
              onMouseOver={e => e.target.style.transform = 'scale(1.02)'}
              onMouseOut={e => e.target.style.transform = 'none'}
            >
              <RefreshCw size={14} /> Refresh Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
