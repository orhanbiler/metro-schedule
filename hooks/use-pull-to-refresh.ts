import { useEffect, useRef, useState, useCallback } from 'react';

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void>;
  threshold?: number;
  refreshTimeout?: number;
}

/**
 * iOS-style pull-to-refresh. Works on iOS and Android alike (plain touch
 * events). Two behaviors matter for the native feel:
 *  - A drag that STARTS mid-page and reaches the top in the same gesture
 *    transitions straight into a pull (not just drags that begin at the top).
 *  - The pull follows the finger with an exponential rubber-band curve and
 *    springs back on release.
 */
export function usePullToRefresh({
  onRefresh,
  threshold = 70,
  refreshTimeout = 3000,
}: UsePullToRefreshOptions) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);

  const startY = useRef(0);
  const lastY = useRef(0);
  const tracking = useRef(false); // a touch gesture is in progress
  const pulling = useRef(false); // the gesture is currently a pull
  const distanceRef = useRef(0); // mirrors pullDistance for the listeners
  const refreshingRef = useRef(false);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  const applyDistance = useCallback((d: number) => {
    distanceRef.current = d;
    setPullDistance(d);
  }, []);

  useEffect(() => {
    const dampen = (raw: number) => {
      // Rubber band: tracks the finger closely at first, eases off with
      // distance, asymptotically approaching maxPull.
      const maxPull = threshold * 2.5;
      return Math.min(maxPull * (1 - Math.exp(-raw / (maxPull * 1.2))), maxPull);
    };

    const springBack = () => {
      const start = distanceRef.current;
      if (start <= 0) return;
      const duration = 250;
      const t0 = performance.now();
      const step = (t: number) => {
        const progress = Math.min((t - t0) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
        applyDistance(start * (1 - eased));
        if (progress < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };

    const atTop = () => window.scrollY <= 0; // iOS reports negative overscroll

    const onTouchStart = (e: TouchEvent) => {
      if (refreshingRef.current) return;
      tracking.current = true;
      startY.current = e.touches[0].clientY;
      lastY.current = startY.current;
      pulling.current = atTop();
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!tracking.current || refreshingRef.current) return;
      const y = e.touches[0].clientY;

      if (!pulling.current) {
        // The same drag scrolled the page up to the top — begin the pull
        // from this point instead of requiring a fresh touch.
        if (atTop() && y > lastY.current) {
          pulling.current = true;
          startY.current = y;
        }
        lastY.current = y;
        return;
      }

      const raw = y - startY.current;
      if (raw > 0 && atTop()) {
        e.preventDefault();
        applyDistance(dampen(raw));
      } else if (raw <= 0) {
        // Finger moved back above the start point: cancel the pull and let
        // normal scrolling resume.
        applyDistance(0);
        if (!atTop()) pulling.current = false;
      }
      lastY.current = y;
    };

    const onTouchEnd = () => {
      if (!tracking.current) return;
      tracking.current = false;
      pulling.current = false;

      const shouldRefresh = distanceRef.current >= threshold && !refreshingRef.current;
      if (!shouldRefresh) {
        springBack();
        return;
      }

      refreshingRef.current = true;
      setIsRefreshing(true);
      if ('vibrate' in navigator) {
        navigator.vibrate(25);
      }

      Promise.race([
        onRefreshRef.current(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Refresh timeout')), refreshTimeout)
        ),
      ])
        .catch((error) => console.error('Refresh failed:', error))
        .finally(() => {
          setTimeout(() => {
            refreshingRef.current = false;
            setIsRefreshing(false);
            applyDistance(0);
          }, 300);
        });
    };

    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd, { passive: true });
    document.addEventListener('touchcancel', onTouchEnd, { passive: true });

    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
      document.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [threshold, refreshTimeout, applyDistance]);

  return {
    isRefreshing,
    pullDistance,
    isPulling: pullDistance > 0,
    pullProgress: Math.min((pullDistance / threshold) * 100, 100),
  };
}
