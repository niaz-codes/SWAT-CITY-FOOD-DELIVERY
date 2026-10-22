import { Router } from 'express';
import { isDBConnected } from '../config/db';

const router = Router();

/** GET /health — liveness + DB connectivity probe. */
router.get('/health', (_req, res) => {
  const db = isDBConnected();
  res.status(db ? 200 : 503).json({
    status: db ? 'ok' : 'degraded',
    database: db ? 'connected' : 'disconnected',
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

export default router;
