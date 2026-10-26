import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getSocket } from '../services/socket';
import { useAuth } from './AuthContext';

type PresenceState = {
  /** Ids of every user with a live socket connection. */
  onlineIds: ReadonlySet<string>;
  onlineCount: number;
  isOnline: (id?: string | null) => boolean;
};

const PresenceContext = createContext<PresenceState>({
  onlineIds: new Set<string>(),
  onlineCount: 0,
  isOnline: () => false,
});

type IdPayload = { userId?: string };
type SnapshotPayload = { userIds?: string[] };

/**
 * Single source of truth for who is currently connected.
 *
 * Every admin surface (live badge, users list, riders list) reads presence from
 * here rather than each opening its own socket listener, so one user joining or
 * leaving updates every indicator at once and they cannot drift apart.
 *
 * Presence is live socket state, not a stored account field: the backend pushes
 * a full snapshot on each connect and `user:online` / `user:offline` deltas
 * afterwards, which is what keeps the indicators correct after a reload.
 */
export function PresenceProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const userId = user?.id;

  const [onlineIds, setOnlineIds] = useState<ReadonlySet<string>>(() => new Set<string>());

  // Presence is admin-only operational data, and a signed-out client must not
  // keep showing who is online. Cleared during render (React's "adjust state
  // when props change" pattern) rather than in an effect.
  const [prevAdmin, setPrevAdmin] = useState(isAdmin);
  if (prevAdmin !== isAdmin) {
    setPrevAdmin(isAdmin);
    if (!isAdmin) setOnlineIds(new Set<string>());
  }

  useEffect(() => {
    if (!isAdmin) return;

    let disposed = false;
    let detach: (() => void) | undefined;

    const setSnapshot = (payload: SnapshotPayload) => {
      if (disposed) return;
      setOnlineIds(new Set(Array.isArray(payload?.userIds) ? payload.userIds : []));
    };

    const setOnline = (payload: IdPayload) => {
      const id = payload?.userId;
      if (disposed || !id) return;
      // Return the same instance when nothing changed so an unrelated event does
      // not re-render every admin list row.
      setOnlineIds((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
    };

    const setOffline = (payload: IdPayload) => {
      const id = payload?.userId;
      if (disposed || !id) return;
      setOnlineIds((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    };

    getSocket().then((socket) => {
      if (!socket || disposed) return;

      const resync = () => socket.emit('presence:request');

      socket.on('presence:snapshot', setSnapshot);
      socket.on('user:online', setOnline);
      socket.on('user:offline', setOffline);
      socket.on('connect', resync);

      // The socket may already be connected by another feature, in which case
      // the connection-time snapshot was emitted before we subscribed.
      if (socket.connected) resync();

      detach = () => {
        socket.off('presence:snapshot', setSnapshot);
        socket.off('user:online', setOnline);
        socket.off('user:offline', setOffline);
        socket.off('connect', resync);
      };
    });

    return () => {
      disposed = true;
      detach?.();
    };
  }, [isAdmin, userId]);

  const isOnline = useCallback(
    (id?: string | null) => (id ? onlineIds.has(id) : false),
    [onlineIds],
  );

  const value = useMemo<PresenceState>(
    () => ({ onlineIds, onlineCount: onlineIds.size, isOnline }),
    [onlineIds, isOnline],
  );

  return <PresenceContext.Provider value={value}>{children}</PresenceContext.Provider>;
}

export function usePresence(): PresenceState {
  return useContext(PresenceContext);
}
