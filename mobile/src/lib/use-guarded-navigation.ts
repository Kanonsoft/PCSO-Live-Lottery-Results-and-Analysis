import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useRef } from 'react';

/**
 * Prevents rapid taps from adding the same destination to the stack more than
 * once. The lock is released when the source screen becomes active again.
 */
export function useGuardedNavigation() {
  const locked = useRef(false);
  const unlockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const unlock = useCallback(() => {
    locked.current = false;
    if (unlockTimer.current) {
      clearTimeout(unlockTimer.current);
      unlockTimer.current = null;
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      unlock();
      return unlock;
    }, [unlock]),
  );

  const navigate = useCallback((href: Href) => {
    if (locked.current) return;
    locked.current = true;
    router.push(href);
    // If a route transition is rejected or interrupted, never leave this
    // screen permanently unable to navigate.
    unlockTimer.current = setTimeout(unlock, 750);
  }, [unlock]);

  return { navigate } as const;
}
