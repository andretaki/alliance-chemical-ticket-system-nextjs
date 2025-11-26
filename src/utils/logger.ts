type LogLevel = 'info' | 'warn' | 'error';

const log = (level: LogLevel, event: string, meta?: Record<string, unknown>) => {
  const payload = {
    level,
    event,
    ts: new Date().toISOString(),
    ...(meta || {}),
  };
  console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](JSON.stringify(payload));
};

export const logInfo = (event: string, meta?: Record<string, unknown>) => log('info', event, meta);
export const logWarn = (event: string, meta?: Record<string, unknown>) => log('warn', event, meta);
export const logError = (event: string, meta?: Record<string, unknown>) => log('error', event, meta);
