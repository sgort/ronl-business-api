import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { config } from './config';
import path from 'path';

// Custom format for development
const devFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, _service, ...meta }) => {
    let msg = `${timestamp} [${level}] ${message}`;
    if (Object.keys(meta).length > 0) {
      msg += ` ${JSON.stringify(meta, null, 2)}`;
    }
    return msg;
  })
);

// Production format (JSON)
const prodFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Transports array
const transports: winston.transport[] = [
  new winston.transports.Console({
    format: config.nodeEnv === 'production' ? prodFormat : devFormat,
  }),
];

// Add file transport if enabled
if (config.logging.fileEnabled) {
  transports.push(
    new DailyRotateFile({
      filename: path.join(config.logging.filePath, 'application-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: config.logging.fileMaxSize,
      maxFiles: config.logging.fileMaxFiles,
      format: prodFormat,
      level: 'info',
    })
  );

  // Separate file for errors
  transports.push(
    new DailyRotateFile({
      filename: path.join(config.logging.filePath, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: config.logging.fileMaxSize,
      maxFiles: config.logging.fileMaxFiles,
      format: prodFormat,
      level: 'error',
    })
  );
}

// Create logger instance
const logger = winston.createLogger({
  level: config.logging.level,
  format: prodFormat,
  defaultMeta: {
    service: 'ronl-business-api',
    environment: config.nodeEnv,
  },
  transports,
  exitOnError: false,
});

// Helper functions for structured logging
export const createLogger = (module: string) => {
  return {
    debug: (message: string, meta?: Record<string, unknown>) =>
      logger.debug(message, { module, ...meta }),
    info: (message: string, meta?: Record<string, unknown>) =>
      logger.info(message, { module, ...meta }),
    warn: (message: string, meta?: Record<string, unknown>) =>
      logger.warn(message, { module, ...meta }),
    error: (message: string, meta?: Record<string, unknown>) =>
      logger.error(message, { module, ...meta }),
  };
};

export default logger;
