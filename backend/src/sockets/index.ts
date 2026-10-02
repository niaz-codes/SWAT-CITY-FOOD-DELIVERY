import type { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { env } from '../config/env';
import { RiderProfileModel, type UserRole } from '../models';
import { verifyAccessToken } from '../utils/tokens';
import type { AuthRequest } from '../middleware/auth';

export interface SocketUser {
  _id: string;
  role: UserRole;
  name?: string;
}

interface Client extends SocketUser {
  lastPing: number;
}

let io: Server | null = null;

export function getIO(): Server {
  if (!io) throw new Error('Socket.IO not initialized');
  return io;
}

export function isSocketReady(): boolean {
  return io !== null;
}

function authSocket(token: string | undefined): SocketUser | null {
  if (!token) return null;
  try {
    const claims = verifyAccessToken(token.replace(/^Bearer\s+/i, ''));
    return { _id: claims.sub, role: claims.role };
  } catch {
    return null;
  }
}

/** Emit an event to a specific user (their dedicated room). */
export function emitToUser(userId: string, event: string, payload: unknown): void {
  const server = getIO();
  server.to(`user:${userId}`).emit(event, payload);
}

export function initSocket(server: HttpServer): Server {
  if (io) return io;

  const serverOpts = {
    cors: {
      origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(','),
      credentials: true,
    },
    maxHttpBufferSize: 1e6,
  };

  const socketServer = new Server(server, serverOpts);
  io = socketServer;

  // In-memory live rider locations. Throttle-written to the DB so we don't
  // hammer MongoDB with every update. Old entries never pile up unbounded.
  const riderLocationCache = new Map<
    string,
    { lat: number; lng: number; heading: number; speed: number; updatedAt: number; dirty: boolean }
  >();

  const persistRiderLocation = async (userId: string) => {
    const loc = riderLocationCache.get(userId);
    if (!loc || !loc.dirty) return;
    loc.dirty = false;
    try {
      await RiderProfileModel.updateOne(
        { user: userId },
        {
          $set: {
            lastLocation: {
              lat: loc.lat,
              lng: loc.lng,
              heading: loc.heading,
              speed: loc.speed,
              updatedAt: new Date(loc.updatedAt),
            },
          },
        },
      );
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`[socket] failed persisting location for ${userId}:`, (error as Error).message);
    }
  };

  const flushAllLocations = async () => {
    const ids = [...riderLocationCache.keys()];
    await Promise.all(ids.map(persistRiderLocation));
  };

  setInterval(() => {
    void flushAllLocations();
  }, 10_000).unref();

  socketServer.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    const user = authSocket(typeof token === 'string' ? token : undefined);
    if (!user) return next(new Error('unauthorized'));
    socket.data.user = user;
    socket.data.client = { ...user, lastPing: Date.now() } as Client;
    next();
  });

  socketServer.on('connection', (socket) => {
    const user = socket.data.user as SocketUser;

    // Every client joins its private room, used by emitToUser().
    socket.join(`user:${user._id}`);

    socketServer.emit('user:online', { userId: user._id });

    const handleRiderLocation = (loc: unknown) => {
      if (user.role !== 'rider') return;
      const body = loc as {
        latitude?: number;
        longitude?: number;
        heading?: number;
        speed?: number;
      };
      if (
        typeof body?.latitude !== 'number' ||
        typeof body.longitude !== 'number' ||
        Number.isNaN(body.latitude) ||
        Number.isNaN(body.longitude)
      ) {
        return;
      }
      const now = Date.now();
      riderLocationCache.set(user._id, {
        lat: body.latitude,
        lng: body.longitude,
        heading: typeof body.heading === 'number' ? body.heading : 0,
        speed: typeof body.speed === 'number' ? Math.max(0, body.speed) : 0,
        updatedAt: now,
        dirty: true,
      });
      // Live broadcast (throttled client-side to ~1 per 3-5s)
      socketServer.emit('rider:location', {
        riderId: user._id,
        latitude: body.latitude,
        longitude: body.longitude,
        heading: typeof body.heading === 'number' ? body.heading : 0,
        speed: typeof body.speed === 'number' ? body.speed : 0,
        timestamp: new Date(now).toISOString(),
      });
    };

    socket.on('rider:location', handleRiderLocation);

    // Acknowledgement keeps the connection measurable from the client side.
    socket.on('user:ping', (_data, ack) => {
      (socket.data.client as Client).lastPing = Date.now();
      if (typeof ack === 'function') ack({ ok: true });
    });

    socket.on('disconnect', () => {
      socketServer.emit('user:offline', { userId: user._id });
      void persistRiderLocation(user._id);
    });
  });

  return io;
}

/** Shared socket event names documented for the frontend socket client. */
export const SOCKET_EVENTS = {
  userOnline: 'user:online',
  userOffline: 'user:offline',
  rideRequest: 'ride:request',
  rideAccepted: 'ride:accepted',
  rideStatus: 'ride:status',
  orderCreated: 'order:created',
  orderStatus: 'order:status',
  orderRiderAssigned: 'order:rider-assigned',
  riderLocation: 'rider:location',
  notificationNew: 'notification:new',
} as const;

// Re-export to avoid importing this file's types from controllers directly.
export type { AuthRequest };