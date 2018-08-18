import Raven from 'raven';
import winston from "winston";
import path from 'path';

class SentryTransport {
    log(level: string, message: string, data: any) {
        Raven.captureBreadcrumb({
            message: message,
            level: level,
            data: data
        });

        if(level === 'error' || level === 'fatal' || level === 'exception') {
            Raven.captureException(new Error(message));
        }
    }
}

if (process.env.SENTRY_DSN) {
    const root = (global as any).__rootdir__;

    const raven = Raven.config(
        process.env.SENTRY_DSN,
        {
            // captureUnhandledRejections: true,
            dataCallback: function (data) {
                var stacktrace = data.exception && data.exception[0].stacktrace;
            
                if (stacktrace && stacktrace.frames) {
                    stacktrace.frames.forEach(function(frame: { filename: string }) {
                        if (frame.filename.startsWith('/')) {
                            frame.filename = "app:///" + path.relative(root, frame.filename);
                        }
                    });
                }
            
                return data;
            }
        }
    );

    raven.install();

    winston.configure({
        transports: [
            new winston.transports.Console({ level: 'silly' }),
            new SentryTransport() as any
        ]
    });

    winston.info('Registering sentry raven');
} else {
    winston.configure({
        transports: [
            new winston.transports.Console({ level: 'silly' }),
        ]
    });
}
