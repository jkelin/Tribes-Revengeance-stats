import * as Sentry from '@sentry/node';
import winston from "winston";
import * as path from 'path';

class SentryTransport {
  log(level: string, message: string, data: any) {
    Sentry.addBreadcrumb({
      message: message,
      level: Sentry.Severity[level],
      data: data
    });

    if (level === 'error' || level === 'fatal' || level === 'exception') {
      Sentry.captureException(new Error(message));
    }
  }
}

if (process.env.SENTRY_DSN) {
  const root = (global as any).__rootdir__;

  Sentry.init(
    {
      dsn: process.env.SENTRY_DSN,
      // captureUnhandledRejections: true,
      // dataCallback: function (data) {
      //   var stacktrace = data.exception && data.exception[0].stacktrace;

      //   if (stacktrace && stacktrace.frames) {
      //     stacktrace.frames.forEach(function (frame: { filename: string }) {
      //       if (frame.filename.startsWith('/')) {
      //         frame.filename = "app:///" + path.relative(root, frame.filename);
      //       }
      //     });
      //   }

      //   return data;
      // }
    }
  );

  winston.configure({
    transports: [
      new winston.transports.Console({ level: 'debug' }),
      new SentryTransport() as any
    ]
  });

  winston.info('Registering sentry raven');
} else {
  winston.configure({
    transports: [
      new winston.transports.Console({ level: 'debug' }),
    ]
  });
}
