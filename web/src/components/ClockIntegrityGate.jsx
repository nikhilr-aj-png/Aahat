import { useCallback, useEffect, useRef, useState } from 'react';
import { Clock3, RefreshCw, WifiOff } from 'lucide-react';
import { isSupabaseConfigured, supabase } from '../supabase';

const MAX_CLOCK_SKEW_MS = 60_000;
const LOCAL_CLOCK_JUMP_MS = 10_000;
const SERVER_RECHECK_MS = 60_000;
const RETRY_MS = 15_000;

async function takeClockSample() {
  const startedAt = Date.now();
  const { data, error } = await supabase.rpc('get_trusted_server_time');
  const finishedAt = Date.now();
  if (error) throw error;

  const serverTime = new Date(data).getTime();
  if (!Number.isFinite(serverTime)) throw new Error('The time server returned an invalid response.');

  return {
    roundTrip: finishedAt - startedAt,
    skew: serverTime - ((startedAt + finishedAt) / 2)
  };
}

async function getBestClockSample() {
  const samples = await Promise.all([takeClockSample(), takeClockSample(), takeClockSample()]);
  return samples.reduce((best, sample) => sample.roundTrip < best.roundTrip ? sample : best);
}

export default function ClockIntegrityGate({ children }) {
  const [state, setState] = useState(isSupabaseConfigured ? 'checking' : 'valid');
  const [isRetrying, setIsRetrying] = useState(false);
  const verifiedRef = useRef(false);
  const checkInFlightRef = useRef(false);
  const baselineRef = useRef({ epoch: Date.now(), monotonic: performance.now() });

  const verifyClock = useCallback(async ({ background = false } = {}) => {
    if (!isSupabaseConfigured || checkInFlightRef.current) return;
    checkInFlightRef.current = true;
    if (!background) setIsRetrying(true);

    try {
      const sample = await getBestClockSample();
      const allowedSkew = MAX_CLOCK_SKEW_MS + (sample.roundTrip / 2);
      if (Math.abs(sample.skew) > allowedSkew) {
        verifiedRef.current = false;
        setState('invalid');
        return;
      }

      verifiedRef.current = true;
      baselineRef.current = { epoch: Date.now(), monotonic: performance.now() };
      setState('valid');
    } catch (error) {
      console.warn('Trusted time verification failed:', error.message);
      if (!verifiedRef.current) setState('unavailable');
    } finally {
      checkInFlightRef.current = false;
      setIsRetrying(false);
    }
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) return undefined;
    void verifyClock();
  }, [verifyClock]);

  useEffect(() => {
    if (!isSupabaseConfigured) return undefined;

    const inspectLocalClock = () => {
      if (!verifiedRef.current) return;
      const baseline = baselineRef.current;
      const epochElapsed = Date.now() - baseline.epoch;
      const monotonicElapsed = performance.now() - baseline.monotonic;
      if (Math.abs(epochElapsed - monotonicElapsed) > LOCAL_CLOCK_JUMP_MS) {
        verifiedRef.current = false;
        setState('invalid');
        void verifyClock({ background: true });
      }
    };

    const interval = window.setInterval(() => {
      inspectLocalClock();
      if (verifiedRef.current) void verifyClock({ background: true });
    }, SERVER_RECHECK_MS);
    const handleFocus = () => {
      inspectLocalClock();
      void verifyClock({ background: true });
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') handleFocus();
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('online', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('online', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [verifyClock]);

  useEffect(() => {
    if (state !== 'invalid' && state !== 'unavailable') return undefined;
    const retry = window.setInterval(() => void verifyClock({ background: true }), RETRY_MS);
    return () => window.clearInterval(retry);
  }, [state, verifyClock]);

  if (state === 'valid') return children;

  if (state === 'checking') {
    return (
      <main className="clock-gate-shell is-checking" role="status" aria-live="polite" aria-label="Preparing Aahat">
        <section className="clock-gate-splash">
          <div className="clock-splash-mark" aria-hidden="true">
            <span className="clock-splash-orbit"><i /></span>
            <span className="clock-splash-halo" />
            <img src="/logo.png" alt="" className="clock-splash-logo" />
          </div>
          <p className="clock-splash-brand">AAHAT</p>
          <h1>Preparing your secure space</h1>
          <p className="clock-splash-copy">Syncing trusted time before your conversations open.</p>
          <div className="clock-splash-progress" aria-hidden="true"><span /></div>
          <p className="clock-splash-status"><span />Protected time check</p>
        </section>
      </main>
    );
  }

  const isInvalid = state === 'invalid';
  const isUnavailable = state === 'unavailable';
  return (
    <main className="clock-gate-shell" role="alert" aria-live="assertive">
      <section className="clock-gate-card">
        <img src="/logo.png" alt="Aahat" className="clock-gate-logo" />
        <div className={`clock-gate-icon ${isInvalid ? 'is-warning' : ''}`}>
          {isUnavailable ? <WifiOff size={30} /> : <Clock3 size={30} />}
        </div>
        <p className="clock-gate-eyebrow">Secure time check</p>
        <h1>
          {state === 'checking' && 'Checking your device time'}
          {isInvalid && 'Correct your device time'}
          {isUnavailable && 'Time verification unavailable'}
        </h1>
        <p className="clock-gate-copy">
          {state === 'checking' && 'Aahat is syncing with trusted real time before opening your conversations.'}
          {isInvalid && 'Your device clock does not match trusted real time. Turn on automatic date and time in device settings, then try again.'}
          {isUnavailable && 'Aahat needs an internet connection to verify trusted time before it can open. Check your connection and retry.'}
        </p>
        {state !== 'checking' && (
          <button type="button" className="clock-gate-retry" onClick={() => void verifyClock()} disabled={isRetrying}>
            <RefreshCw size={17} className={isRetrying ? 'is-spinning' : ''} />
            {isRetrying ? 'Checking…' : 'Check again'}
          </button>
        )}
        <p className="clock-gate-hint">Use network-provided time · 12/24-hour display follows your device</p>
      </section>
    </main>
  );
}
