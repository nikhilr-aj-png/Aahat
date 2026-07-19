import { useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import './TouchPullToRefresh.css';

const REFRESH_THRESHOLD_PX = 72;
const MAX_PULL_PX = 104;

export default function TouchRefreshGesture() {
  const [distance, setDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const gestureRef = useRef({ active: false, pointerId: null, startY: 0, distance: 0 });
  const touchCapable = typeof navigator !== 'undefined' && (navigator.maxTouchPoints || 0) > 0;

  if (!touchCapable) return null;

  const reset = () => {
    gestureRef.current = { active: false, pointerId: null, startY: 0, distance: 0 };
    if (!isRefreshing) setDistance(0);
  };

  const handlePointerDown = event => {
    if (isRefreshing || event.pointerType === 'mouse' || !event.isPrimary) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    gestureRef.current = {
      active: true,
      pointerId: event.pointerId,
      startY: event.clientY,
      distance: 0
    };
  };

  const handlePointerMove = event => {
    const gesture = gestureRef.current;
    if (!gesture.active || gesture.pointerId !== event.pointerId) return;
    const delta = event.clientY - gesture.startY;
    const resisted = delta > 0 ? Math.min(MAX_PULL_PX, delta * 0.5) : 0;
    gesture.distance = resisted;
    setDistance(resisted);
  };

  const handlePointerEnd = event => {
    const gesture = gestureRef.current;
    if (!gesture.active || gesture.pointerId !== event.pointerId) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    if (gesture.distance < REFRESH_THRESHOLD_PX) {
      reset();
      return;
    }
    gestureRef.current.active = false;
    setIsRefreshing(true);
    setDistance(84);
    window.setTimeout(() => window.location.reload(), 220);
  };

  const isReady = distance >= REFRESH_THRESHOLD_PX;
  return (
    <>
      <div
        className="touch-refresh-edge"
        aria-hidden="true"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={reset}
      />
      <div
        className={`touch-refresh-indicator${distance > 0 ? ' is-visible' : ''}${isReady ? ' is-ready' : ''}${isRefreshing ? ' is-refreshing' : ''}`}
        style={{
          '--pull-distance': `${distance}px`,
          '--pull-rotation': `${Math.min(distance, 90) * 3}deg`
        }}
        role="status"
        aria-live="polite"
        aria-hidden={distance <= 0}
      >
        <span className="touch-refresh-icon"><RefreshCw size={18} /></span>
        <span>{isRefreshing ? 'Refreshing Aahat...' : isReady ? 'Release to refresh' : 'Pull to refresh'}</span>
      </div>
    </>
  );
}
