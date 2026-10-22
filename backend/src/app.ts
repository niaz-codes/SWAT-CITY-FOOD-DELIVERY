import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import { env, allowedOrigins } from './config/env';
import apiRoutes from './routes';
import healthRoutes from './routes/health.routes';
import webRoutes from './routes/web.routes';
import { errorHandler, notFound } from './middleware/error';
import { globalRateLimiter } from './middleware/rateLimit';
import { requestId, type RequestWithId } from './middleware/requestId';

const app = express();

app.set('trust proxy', 1);

// Security headers (CSP disabled — this is a JSON API, not a browser app).
app.use(helmet({ contentSecurityPolicy: false }));

// Correlation id: mounted before morgan so every log line can carry it, and its
// value is reflected back on the X-Request-Id response header for every reply.
app.use(requestId);

// CORS for the mobile clients / admin web. With an explicit allow-list the
// origin is matched and credentials are allowed (the admin web uses cookies).
// A wildcard must NEVER be combined with credentials: in that mode every
// origin is reflected, so credentials are deliberately disabled.
const wildcardCors = allowedOrigins.includes('*');
app.use(
  cors({
    origin: wildcardCors
      ? true
      : (origin, cb) => {
          if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
          return cb(new Error('Not allowed by CORS'));
        },
    credentials: !wildcardCors,
  }),
);

// Request logging. Every line carries the request id so a failing call can be
// matched to its response in minutes instead of guesses.
morgan.token('req-id', (req) => String((req as RequestWithId).id ?? '-'));
app.use(morgan(':remote-addr :method :url :status :response-time ms req-id=:req-id'));

// Body parsing
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Local upload fallback files (used when remote object storage isn't reachable)
app.use('/uploads', express.static(path.resolve(__dirname, '../uploads')));

// Health probe (outside the API limiter)
app.use(healthRoutes);

// Site-root operational endpoints (integration status). These live at the root,
// NOT under /api, so a deploy can check them against the bare origin.
app.use(webRoutes);

// Auth-focused rate limiting is defined at route level; global guard last.
app.use('/api', globalRateLimiter, apiRoutes);

// 404 + centralized errors
app.use(notFound);
app.use(errorHandler);

export { app, env };
