import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import { env, allowedOrigins, isProduction } from './config/env';
import apiRoutes from './routes';
import healthRoutes from './routes/health.routes';
import webRoutes from './routes/web.routes';
import { errorHandler, notFound } from './middleware/error';
import { globalRateLimiter } from './middleware/rateLimit';

const app = express();

app.set('trust proxy', 1);

// Security headers (CSP disabled — this is a JSON API, not a browser app).
app.use(helmet({ contentSecurityPolicy: false }));

// CORS for the mobile clients / admin web.
app.use(
  cors({
    origin: allowedOrigins.includes('*')
      ? true
      : (origin, cb) => {
          if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
          return cb(new Error('Not allowed by CORS'));
        },
    credentials: true,
  }),
);

// Request logging
app.use(morgan(isProduction ? 'combined' : 'dev'));

// Body parsing
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Local upload fallback files (used when Cloudinary isn't configured)
app.use('/uploads', express.static(path.resolve(__dirname, '../uploads')));

// Health probe (outside the API limiter)
app.use(healthRoutes);

// Password-reset landing page, App Links / AASA association files and the
// integration status report. These live at the site root, NOT under /api,
// because the email links to the bare origin.
app.use(webRoutes);

// Auth-focused rate limiting is defined at route level; global guard last.
app.use('/api', globalRateLimiter, apiRoutes);

// 404 + centralized errors
app.use(notFound);
app.use(errorHandler);

export { app, env };