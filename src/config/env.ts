/**
 * Environment Configuration
 * Centralized environment variable management with validation
 */

import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  // Server
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3000'),
  API_VERSION: z.string().default('v1'),

  // Supabase
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_KEY: z.string().min(1),

  // Growatt
  GROWATT_BASE_URL: z.string().url(),
  GROWATT_USERNAME: z.string().min(1),
  GROWATT_PASSWORD: z.string().min(1),

  // JWT
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('7d'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),

  // Security
  BCRYPT_ROUNDS: z.string().default('12'),
  RATE_LIMIT_WINDOW_MS: z.string().default('900000'),
  RATE_LIMIT_MAX_REQUESTS: z.string().default('100'),

  // Monitoring
  MONITOR_INTERVAL_MINUTES: z.string().default('5'),
  SYNC_SITES_INTERVAL_HOURS: z.string().default('24'),
  ALERT_CHECK_INTERVAL_MINUTES: z.string().default('3'),

 
  // Resend
  RESEND_API_KEY: z.string().min(1, 'RESEND_API_KEY is required'),
  RESEND_FROM_EMAIL: z.string().email().default('onboarding@resend.dev'),
  RESEND_FROM_NAME: z.string().default('Your App'),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),




  // Thresholds
  OFFLINE_THRESHOLD_MINUTES: z.string().default('10'),
  BATTERY_LOW_THRESHOLD: z.string().default('20'),
  TEMPERATURE_HIGH_THRESHOLD: z.string().default('65'),
  CIRCUIT_BREAKER_TIMEOUT: z.string().default('10000'),
  CIRCUIT_BREAKER_ERROR_THRESHOLD: z.string().default('50'),
  CIRCUIT_BREAKER_RESET_TIMEOUT: z.string().default('30000'),


  WORKER_CONCURRENCY: z.string().default('5'),



REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.string().default('6379'),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.string().default('0'),
  // Email
  SMTP_HOST: z.string(),
  SMTP_PORT: z.string(),
  SMTP_SECURE: z.string().default('false'),
  SMTP_USER: z.string().email(),
  SMTP_PASSWORD: z.string(),
  EMAIL_FROM: z.string().email(),

  // Logging
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  LOG_FILE_PATH: z.string().default('./logs/app.log'),

  // CORS
  ALLOWED_ORIGINS: z.string(),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('❌ Invalid environment variables:');
  console.error(parsedEnv.error.flatten().fieldErrors);
  throw new Error('Invalid environment variables');
}

export const env = {
  ...parsedEnv.data,
  port: parseInt(parsedEnv.data.PORT),
  bcryptRounds: parseInt(parsedEnv.data.BCRYPT_ROUNDS),
  rateLimitWindowMs: parseInt(parsedEnv.data.RATE_LIMIT_WINDOW_MS),
  rateLimitMaxRequests: parseInt(parsedEnv.data.RATE_LIMIT_MAX_REQUESTS),
  monitorIntervalMinutes: parseInt(parsedEnv.data.MONITOR_INTERVAL_MINUTES),
  syncSitesIntervalHours: parseInt(parsedEnv.data.SYNC_SITES_INTERVAL_HOURS),
  alertCheckIntervalMinutes: parseInt(parsedEnv.data.ALERT_CHECK_INTERVAL_MINUTES),
  offlineThresholdMinutes: parseInt(parsedEnv.data.OFFLINE_THRESHOLD_MINUTES),
  batteryLowThreshold: parseInt(parsedEnv.data.BATTERY_LOW_THRESHOLD),
  temperatureHighThreshold: parseInt(parsedEnv.data.TEMPERATURE_HIGH_THRESHOLD),
  smtpPort: parseInt(parsedEnv.data.SMTP_PORT),
  smtpSecure: parsedEnv.data.SMTP_SECURE === 'true',
  allowedOrigins: parsedEnv.data.ALLOWED_ORIGINS.split(','),
  isProduction: parsedEnv.data.NODE_ENV === 'production',
  isDevelopment: parsedEnv.data.NODE_ENV === 'development',
  isTest: parsedEnv.data.NODE_ENV === 'test',
};


