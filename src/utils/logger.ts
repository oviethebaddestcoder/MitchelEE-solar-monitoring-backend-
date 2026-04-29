import winston from 'winston';
import { env } from '@/config/env.js';

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ level, message, timestamp, stack }) => {
    if (stack) {
      return `${timestamp} [${level.toUpperCase()}]: ${message}\n${stack}`;
    }
    return `${timestamp} [${level.toUpperCase()}]: ${message}`;
  })
);

export const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  format: logFormat,
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(winston.format.colorize(), logFormat),
    }),
    new winston.transports.File({
      filename: env.LOG_FILE_PATH,
      level: 'error',
    }),
    new winston.transports.File({
      filename: env.LOG_FILE_PATH.replace('.log', '-combined.log'),
    }),
  ],
  exceptionHandlers: [
    new winston.transports.File({
      filename: env.LOG_FILE_PATH.replace('.log', '-exceptions.log'),
    }),
  ],
});

export const logStream = {
  write: (message: string) => {
    logger.info(message.trim());
  },
};