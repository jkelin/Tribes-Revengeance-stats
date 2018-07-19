import Raven from 'raven';
import winston from "winston";
import path from 'path';
import Transport from 'winston-transport';

class SentryTransport {
    log(level, message, data) {
        Raven.captureBreadcrumb({
            message: message,
            level: level,
            data: data
        });
    }
}

if (process.env.SENTRY_DSN) {
    const root = (global as any).__rootdir__;
    winston.info('Registering sentry raven');

    const raven = Raven.config(
        process.env.SENTRY_DSN,
        {
            // captureUnhandledRejections: true,
            dataCallback: function (data) {
                var stacktrace = data.exception && data.exception[0].stacktrace;
            
                if (stacktrace && stacktrace.frames) {
                    stacktrace.frames.forEach(function(frame) {
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
}
