import type { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { env } from '../config/env';
import { OrderModel, RiderProfileModel, type UserRole } from '../models';
import { verifyAccessToken } from '../utils/tokens';
import {
  clearRiderLocation,
  flushRiderLocation,
  isRiderLocationTrackable,
  recordRiderLocation,
  startRiderLocationFlusher,
} from '../services/riderLocation.service';
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

/**
 * Fan a rider's fix out to only the people allowed to see it.
 *
 * A rider's position is confidential: it goes to the admin room and to the
 * customers who currently have an active delivery with that rider. It must
 * never be broadcast to the whole server, otherwise every logged-in customer
 * could track every rider in the city. The rider keeps their own room so their
 * device can confirm the upload landed.
 */
async function emitRiderLocation(riderId: string, payload: Record<string, unknown>): Promise<void> {
  const server = getIO();

  // Only customers with a live delivery can see this rider move.
  const activeDeliveries = await OrderModel.find({
    rider: riderId,
    status: { $in: ['rider_assigned', 'picked_up', 'on_the_way'] },
  })
    .select('customer')
    .lean();

  server.to('role:admin').emit('rider:location', payload);
  server.to(`user:${riderId}`).emit('rider:location', payload);

  for (const delivery of activeDeliveries) {
    server.to(`user:${delivery.customer}`).emit('rider:location', {
      ...payload,
      // The customer only ever needs the assigned rider's marker, scoped to
      // their own order.
      orderId: String(delivery._id),
    });
  }
}

export function initSocket(server: HttpServer): Server {
  if (io) return io;

  const serverOpts = {
    cors: {
      // Same rules as the REST app (app.ts): trim stray whitespace around
      // origins and disable credentials for the dev wildcard so socket and
      // REST behaviour cannot drift apart.
      origin:
        env.CORS_ORIGIN.trim() === '*'
          ? true
          : env.CORS_ORIGIN.split(',').map((value) => value.trim()).filter(Boolean),
      credentials: env.CORS_ORIGIN.trim() !== '*',
    },
    maxHttpBufferSize: 1e6,
  };

  const socketServer = new Server(server, serverOpts);
  io = socketServer;

  // Live rider locations live in riderLocation.service so the REST fallback and
  // the socket share one cache and one throttle.
  startRiderLocationFlusher();

  // Connected sockets per user. Presence is derived from live sockets rather
  // than a database flag, so it survives an app reload for every session that
  // is still connected and never goes stale for a user that crashed out.
  // Counting sockets means a user with the app open on two devices only turns
  // offline once the last device disconnects.
  const presence = new Map<string, number>();

  const addPresence = (userId: string) => {
    presence.set(userId, (presence.get(userId) ?? 0) + 1);
  };

  // Returns the number of sockets the user still has left, so the caller can
  // emit `user:offline` exactly once per user instead of once per device.
  const removePresence = (userId: string) => {
    const remaining = (presence.get(userId) ?? 1) - 1;
    if (remaining <= 0) presence.delete(userId);
    return remaining;
  };

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

    // Admins also join a shared room so live rider locations can reach them
    // without fanning out to every socket on the server.
    if (user.role === 'admin') socket.join('role:admin');
    // Approved-status work signals (a job becoming available) go to this room.
    // It carries no customer data, only the order id/number and its status.
    if (user.role === 'rider') socket.join('role:rider');

    // Presence is operational data, so it is admin-only rather than broadcast
    // to every connected client.
    //
    // Register before broadcasting: a snapshot sent during this connection must
    // already include the user that just joined. The deltas alone are not
    // enough for an admin, because it only learns about users who connect after
    // it; the snapshot is what makes the live list correct after a reload
    // instead of waiting for the next join event.
    addPresence(user._id);
    socketServer.to('role:admin').emit('user:online', { userId: user._id });
    if (user.role === 'admin') {
      socket.emit('presence:snapshot', { userIds: [...presence.keys()] });
      // An admin client that attaches to an already-connected shared socket
      // never sees that connection-time snapshot, so let it ask for the
      // current state instead of waiting for the next user to join.
      socket.on('presence:request', () => {
        socket.emit('presence:snapshot', { userIds: [...presence.keys()] });
      });
    }

    // Location updates are only accepted while the rider is approved and
    // actually working. An offline or rejected rider cannot move their marker,
    // and a stale fix is dropped rather than left on the map.
    const handleRiderLocation = async (loc: unknown) => {
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
        Number.isNaN(body.longitude) ||
        body.latitude < -90 ||
        body.latitude > 90 ||
        body.longitude < -180 ||
        body.longitude > 180
      ) {
        return;
      }

      const profile = await RiderProfileModel.findOne({ user: user._id })
        .select('status approvalStatus')
        .lean();
      if (!isRiderLocationTrackable(profile?.status, profile?.approvalStatus)) {
        clearRiderLocation(user._id);
        return;
      }

      recordRiderLocation(user._id, {
        latitude: body.latitude,
        longitude: body.longitude,
        heading: body.heading,
        speed: body.speed,
      });

      const now = new Date();
      // Live broadcast (throttled client-side to ~1 per 3-5s). Delivery is
      // scoped server-side: admins plus customers with an active delivery.
      await emitRiderLocation(user._id, {
        riderId: user._id,
        latitude: body.latitude,
        longitude: body.longitude,
        heading: typeof body.heading === 'number' ? body.heading : 0,
        speed: typeof body.speed === 'number' ? body.speed : 0,
        status: profile?.status ?? 'online',
        timestamp: now.toISOString(),
      });
    };

    // Async listeners must not leak rejections onto the socket emitter; a bad
    // payload or a database hiccup drops one fix, it must not kill the process.
    socket.on('rider:location', (loc: unknown) => {
      handleRiderLocation(loc).catch(() => undefined);
    });

    // Acknowledgement keeps the connection measurable from the client side.
    socket.on('user:ping', (_data, ack) => {
      (socket.data.client as Client).lastPing = Date.now();
      if (typeof ack === 'function') ack({ ok: true });
    });

    // Flush the last known fix so admin/the assigned customer still see where the
    // rider was, but keep the cached entry: a dropped socket is not the same as
    // the rider choosing to go Offline, and the stale timestamp makes the age
    // of the fix obvious to the reader.
    socket.on('disconnect', () => {
      // Only the last socket of a user means the user is really offline;
      // closing one of two devices must not grey out a still-present session.
      if (removePresence(user._id) === 0) {
        socketServer.to('role:admin').emit('user:offline', { userId: user._id });
      }
      void flushRiderLocation(user._id);
    });
  });

  return io;
}

/** Shared socket event names documented for the frontend socket client. */
export const SOCKET_EVENTS = {
  presenceSnapshot: 'presence:snapshot',
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
