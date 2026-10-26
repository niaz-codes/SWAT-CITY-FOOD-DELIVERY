import { io, type Socket } from 'socket.io-client';
import { API_BASE_URL, getAccessToken } from './client';

/**
 * Socket URL is the API origin without the trailing `/api` path segment.
 */
export const SOCKET_URL = API_BASE_URL.replace(/\/api\/?$/, '');

let socket: Socket | null = null;
let connecting: Promise<Socket | null> | null = null;

/**
 * Returns the shared authenticated socket, creating it on first use.
 *
 * The access token is fetched fresh on connect because refresh can rotate it,
 * and a socket authenticated with a stale token would be silently rejected by
 * the server handshake.
 */
export async function getSocket(): Promise<Socket | null> {
  if (socket?.connected) return socket;
  if (connecting) return connecting;

  connecting = (async () => {
    const token = await getAccessToken();
    if (!token) return null;

    const created = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket'],
      reconnectionAttempts: 6,
      reconnectionDelay: 2000,
      timeout: 10000,
    });
    socket = created;
    return created;
  })();

  try {
    return await connecting;
  } finally {
    connecting = null;
  }
}

/** Subscribe to an event and get an unsubscribe function for effect cleanup. */
export async function onSocketEvent<T = unknown>(
  event: string,
  handler: (payload: T) => void,
): Promise<() => void> {
  const active = await getSocket();
  if (!active) return () => undefined;
  active.on(event, handler);
  return () => {
    active.off(event, handler);
  };
}

export function closeSocket(): void {
  socket?.disconnect();
  socket = null;
}
