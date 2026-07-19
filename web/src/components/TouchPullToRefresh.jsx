import { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import './TouchPullToRefresh.css';

const EDGE_START_PX = 64;
const REFRESH_THRESHOLD_PX = 72;
const MAX_PULL_PX = 104;

const scrollableParent = target => {
  let node = target instanceof Element ? target : null;
  while (node && node !== document.body) {
    const style = window.getComputedStyle(node);
    if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight) return node;
    node = node.parentElement;
  }
  return document.scrollingElement;
};

export default function TouchPullToRefresh() {
  const [distance, setDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const gestureRef = useRef({ tracking: false, startY: 0, distance: 0, scroller: null });

  useEffect(() => {
    if (!('ontouchstart' in window) && (navigator.maxTouchPoints || 0) < 1) return undefined;

    const reset = () => {
      gestureRef.current = { tracking: false, startY: 0, distance: 0, scroller: null };
      if (!isRefreshing) setDistance(0);
    };

    const handleTouchStart = event => {
      if (isRefreshing || event.touches.length !== 1) return;
      const touch = event.touches[0];
      if (touch.clientY > EDGE_START_PX) return;
      const scroller = scrollableParent(event.target);
      if (scroller && scroller.scrollTop > 0) return;
      gestureRef.current = { tracking: true, startY: touch.clientY, distance: 0, scroller };
    };

    const handleTouchMove = event => {
      const gesture = gestureRef.current;
      if (!gesture.tracking || event.touches.length !== 1) return;
      if (gesture.scroller && gesture.scroller.scrollTop > 0) {
        reset();
        return;
      }
      const delta = event.touches[0].clientY - gesture.startY;
      if (delta <= 0) {
        gesture.distance = 0;
        setDistance(0);
        return;
      }
      if (event.cancelable) event.preventDefault();
      const resisted = Math.min(MAX_PULL_PX, delta * 0.48);
      gesture.distance = resisted;
      setDistance(resisted);
    };

    const handleTouchEnd = () => {
      const gesture = gestureRef.current;
      if (!gesture.tracking) return;
      const shouldRefresh = gesture.distance >= REFRESH_THRESHOLD_PX;
      gestureRef.current.tracking = false;
      if (!shouldRefresh) {
        reset();
        return;
      }
      setIsRefreshing(true);
      setDistance(84);
      window.setTimeout(() => window.location.reload(), 220);
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });
    document.addEventListener('touchcancel', reset, { passive: true });
    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
      document.removeEventListener('touchcancel', reset);
    };
  }, [isRefreshing]);

  const isReady = distance >= REFRESH_THRESHOLD_PX;
  return (
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
  );
}
