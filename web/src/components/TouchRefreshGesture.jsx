import { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import './TouchPullToRefresh.css';

const REFRESH_THRESHOLD_PX = 78;
const MAX_PULL_PX = 112;
const PULL_RESISTANCE = 0.5;
const TOP_TOLERANCE_PX = 2;
const CHAT_GESTURE_AREA = '.sidebar, .chat-area-container, .chat-view.empty';
const GESTURE_EXCLUSIONS = 'input, textarea, select, button, [contenteditable="true"], .chat-input-area-wrapper, .modal-overlay';

const emptyGesture = () => ({ active: false, startX: 0, startY: 0, distance: 0 });

function findScrollableParent(start, boundary) {
  let element = start instanceof Element ? start : null;
  while (element && element !== boundary.parentElement) {
    const style = window.getComputedStyle(element);
    const canScrollY = /(auto|scroll)/.test(style.overflowY)
      && element.scrollHeight > element.clientHeight + 1;
    if (canScrollY) return element;
    if (element === boundary) break;
    element = element.parentElement;
  }
  return null;
}

function canStartChatPull(target) {
  if (!(target instanceof Element) || target.closest(GESTURE_EXCLUSIONS)) return false;
  const boundary = target.closest(CHAT_GESTURE_AREA);
  if (!boundary) return false;
  const scrollParent = findScrollableParent(target, boundary);
  if (scrollParent) return scrollParent.scrollTop <= TOP_TOLERANCE_PX;
  const pageScrollTop = Math.max(
    window.scrollY || 0,
    document.documentElement.scrollTop || 0,
    document.body.scrollTop || 0,
  );
  return pageScrollTop <= TOP_TOLERANCE_PX;
}

export default function TouchRefreshGesture() {
  const [distance, setDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const gestureRef = useRef(emptyGesture());
  const refreshingRef = useRef(false);
  const touchCapable = typeof navigator !== 'undefined' && (navigator.maxTouchPoints || 0) > 0;

  useEffect(() => {
    if (!touchCapable) return undefined;
    const reset = () => {
      gestureRef.current = emptyGesture();
      if (!refreshingRef.current) setDistance(0);
    };

    const handleTouchStart = event => {
      if (refreshingRef.current || event.touches.length !== 1 || !canStartChatPull(event.target)) {
        reset();
        return;
      }
      const touch = event.touches[0];
      gestureRef.current = { active: true, startX: touch.clientX, startY: touch.clientY, distance: 0 };
    };

    const handleTouchMove = event => {
      const gesture = gestureRef.current;
      if (!gesture.active || event.touches.length !== 1) return;
      const touch = event.touches[0];
      const deltaY = touch.clientY - gesture.startY;
      const deltaX = touch.clientX - gesture.startX;
      if (deltaY < 0 || Math.abs(deltaX) > Math.max(16, deltaY * 0.75)) {
        reset();
        return;
      }
      if (deltaY <= 0) return;
      event.preventDefault();
      const resisted = Math.min(MAX_PULL_PX, deltaY * PULL_RESISTANCE);
      gesture.distance = resisted;
      setDistance(resisted);
    };

    const handleTouchEnd = () => {
      const gesture = gestureRef.current;
      if (!gesture.active) return;
      if (gesture.distance < REFRESH_THRESHOLD_PX) {
        reset();
        return;
      }
      gestureRef.current = emptyGesture();
      refreshingRef.current = true;
      setIsRefreshing(true);
      setDistance(86);
      window.setTimeout(() => window.location.reload(), 220);
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: true, capture: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: false, capture: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true, capture: true });
    document.addEventListener('touchcancel', reset, { passive: true, capture: true });
    return () => {
      document.removeEventListener('touchstart', handleTouchStart, true);
      document.removeEventListener('touchmove', handleTouchMove, true);
      document.removeEventListener('touchend', handleTouchEnd, true);
      document.removeEventListener('touchcancel', reset, true);
    };
  }, [touchCapable]);

  if (!touchCapable) return null;

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
