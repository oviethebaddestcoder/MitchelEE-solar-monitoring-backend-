import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { env } from '@/config/env.js';
import { logger } from '@/utils/logger.js';
import { AppError } from '@/utils/errorHandler.js';
import { rateLimiterMiddleware } from '@/middlewares/rateLimiter.middleware.js';

// Routes
import authRoutes from './routes/auth.routes.js';
import sitesRoutes from './routes/sites.routes.js';
import alertsRoutes from './routes/alerts.routes.js';
import engineersRoutes from './routes/engineers.routes.js';
import reportsRoutes from './routes/reports.routes.js';
import queueRoutes from './routes/queue.routes.js';

const app = express();

// Middleware
app.use(helmet());
app.use(cors({ origin: env.ALLOWED_ORIGINS, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(compression());
app.use(rateLimiterMiddleware);

// Request logging
app.use((req, _res, next) => {
  logger.info(`${req.method} ${req.url}`);
  next();
});

// Health check
app.get('/health', (_req, res) => {
  res.json({
    success: true,
    message: 'Solar Inverter Platform API is running',
    timestamp: new Date().toISOString(),
  });
});

// Routes
app.use(`/api/${env.API_VERSION}/auth`, authRoutes);
app.use(`/api/${env.API_VERSION}/sites`, sitesRoutes);
app.use(`/api/${env.API_VERSION}/alerts`, alertsRoutes);
app.use(`/api/${env.API_VERSION}/engineers`, engineersRoutes);
app.use(`/api/${env.API_VERSION}/reports`, reportsRoutes);
app.use(`/api/${env.API_VERSION}/queue`, queueRoutes);

// Error handler
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  logger.error('Error:', err);

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
    });
  }

  return res.status(500).json({
    success: false,
    message: env.isProduction ? 'Internal server error' : err.message,
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
});

export default app;