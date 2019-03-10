import * as Sentry from '@sentry/node';
import * as path from 'path';
import * as winston from 'winston';

class SentryTransport {
  public log(level: string, message: string, data: any) {
    Sentry.addBreadcrumb({
      message,
      level: Sentry.Severity[level],
      data,
    });

    if (level === 'error' || level === 'fatal' || level === 'exception') {
      Sentry.captureException(new Error(message));
    }
  }
}

export function initLogger() {
  if (process.env.SENTRY_DSN) {
    const root = (global as any).__rootdir__;

    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      release: process.env.SENTRY_RELEASE,
    });

    winston.configure({
      transports: [new winston.transports.Console({ level: 'debug' }), new SentryTransport() as any],
    });

    winston.info('Registering sentry raven');
  } else {
    winston.configure({
      transports: [new winston.transports.Console({ level: 'debug' })],
    });
  }
}
