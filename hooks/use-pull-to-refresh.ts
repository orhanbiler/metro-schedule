import { useEffect, useRef, useState, useCallback } from 'react';

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void>;
  threshold?: number;
  refreshTimeout?: number;
}

export function usePullToRefresh({
  onRefresh,
  threshold = 60, // More native iOS threshold
  refreshTimeout = 3000,
}: UsePullToRefreshOptions) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const startY = useRef(0);
  const isPulling = useRef(false);
  const lastTouchTime = useRef(0);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (window.scrollY === 0) {
      startY.current = e.touches[0].clientY;
      isPulling.current = true;
    }
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isPulling.current || isRefreshing) return;
    
    const currentY = e.touches[0].clientY;
    const rawDistance = currentY - startY.current;
    
    if (rawDistance > 0 && window.scrollY === 0) {
      e.preventDefault();
      // Apply iOS-style rubber band damping effect
      const dampingFactor = 0.4; // Reduced for more realistic feel
      const dampedDistance = rawDistance * dampingFactor + (rawDistance > threshold ? (rawDistance - threshold) * 0.1 : 0);
      setPullDistance(Math.min(dampedDistance, threshold * 1.2));
      lastTouchTime.current = Date.now();
    }
  }, [isRefreshing, threshold]);

  const handleTouchEnd = useCallback(async () => {
    if (!isPulling.current) return;
    
    isPulling.current = false;
    const shouldRefresh = pullDistance >= threshold && !isRefreshing;
    
    if (shouldRefresh) {
      setIsRefreshing(true);
      // Add subtle haptic feedback for refresh trigger
      if ('vibrate' in navigator) {
        navigator.vibrate(25);
      }
      
      try {
        await Promise.race([
          onRefresh(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Refresh timeout')), refreshTimeout)
          ),
        ]);
      } catch (error) {
        console.error('Refresh failed:', error);
      } finally {
        // Spring animation back to 0
        setTimeout(() => {
          setIsRefreshing(false);
          setPullDistance(0);
        }, 300);
      }
    } else {
      // Spring animation back to 0 for cancel
      const startDistance = pullDistance;
      const duration = 200;
      const startTime = Date.now();
      
      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3); // Ease out cubic
        setPullDistance(startDistance * (1 - eased));
        
        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          setPullDistance(0);
        }
      };
      requestAnimationFrame(animate);
    }
  }, [pullDistance, threshold, isRefreshing, onRefresh, refreshTimeout]);

  useEffect(() => {
    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });
    
    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  return {
    isRefreshing,
    pullDistance,
    isPulling: pullDistance > 0,
    pullProgress: Math.min((pullDistance / threshold) * 100, 100),
  };
}