/**
 * Minimal Structured Logger
 * Replaces scattered console.log with consistent, context-aware logging.
 *
 * Usage:
 *   import { logger } from '@/lib/logger';
 *   logger.info('Order processed', { orderId: '123', status: 'shipped' });
 *   logger.error('Payment failed', error, { customerId: '456' });
 */

import { env } from '@/lib/env';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: unknown;
}

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// Only show debug logs in development
const MIN_LEVEL = env.NODE_ENV === 'production' ? 'info' : 'debug';

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[MIN_LEVEL];
}

function formatError(error: Error): LogEntry['error'] {
  return {
    name: error.name,
    message: error.message,
    stack: env.NODE_ENV === 'development' ? error.stack : undefined,
  };
}

function createLogEntry(
  level: LogLevel,
  message: string,
  error?: Error,
  context?: LogContext
): LogEntry {
  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
  };

  if (context && Object.keys(context).length > 0) {
    entry.context = context;
  }

  if (error) {
    entry.error = formatError(error);
  }

  return entry;
}

function log(level: LogLevel, message: string, error?: Error, context?: LogContext): void {
  if (!shouldLog(level)) return;

  const entry = createLogEntry(level, message, error, context);

  // In production, output JSON for log aggregation
  if (env.NODE_ENV === 'production') {
    const output = JSON.stringify(entry);
    switch (level) {
      case 'error':
        console.error(output);
        break;
      case 'warn':
        console.warn(output);
        break;
      default:
        console.log(output);
    }
    return;
  }

  // In development, use readable format
  const prefix = `[${level.toUpperCase()}]`;
  const contextStr = context ? ` ${JSON.stringify(context)}` : '';

  switch (level) {
    case 'error':
      console.error(`${prefix} ${message}${contextStr}`, error || '');
      break;
    case 'warn':
      console.warn(`${prefix} ${message}${contextStr}`);
      break;
    case 'debug':
      console.debug(`${prefix} ${message}${contextStr}`);
      break;
    default:
      console.log(`${prefix} ${message}${contextStr}`);
  }
}

export const logger = {
  debug: (message: string, context?: LogContext) => log('debug', message, undefined, context),
  info: (message: string, context?: LogContext) => log('info', message, undefined, context),
  warn: (message: string, context?: LogContext) => log('warn', message, undefined, context),
  error: (message: string, error?: Error, context?: LogContext) => log('error', message, error, context),

  /**
   * Create a child logger with preset context
   * @example
   * const orderLogger = logger.child({ service: 'orders', orderId: '123' });
   * orderLogger.info('Processing'); // Includes orderId in all logs
   */
  child: (baseContext: LogContext) => ({
    debug: (message: string, context?: LogContext) =>
      log('debug', message, undefined, { ...baseContext, ...context }),
    info: (message: string, context?: LogContext) =>
      log('info', message, undefined, { ...baseContext, ...context }),
    warn: (message: string, context?: LogContext) =>
      log('warn', message, undefined, { ...baseContext, ...context }),
    error: (message: string, error?: Error, context?: LogContext) =>
      log('error', message, error, { ...baseContext, ...context }),
  }),
};

export type Logger = typeof logger;
