import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { notificationApi } from '../services/api';

/**
 * Live unread-notification count for header badges.
 *
 * Fetched on every focus rather than on mount only, so the badge on Home or
 * Profile clears as soon as the customer comes back from the Notifications
 * screen. Kept as its own hook so both entry points share one fetch rule
 * instead of hardcoding a number in each header.
 */
export function useUnreadNotifications(): number {
  const [count, setCount] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      notificationApi
        .get()
        .then((list) => {
          if (active) setCount(list.filter((n) => !n.read).length);
        })
        .catch(() => {
          // A failed badge refresh must never interrupt browsing.
        });
      return () => {
        active = false;
      };
    }, []),
  );

  return count;
}
