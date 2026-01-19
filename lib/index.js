/**
 * Global logger, new version
 */
import { createConsola, LogLevels } from "consola";
export const debugEnvironments = [
    'development',
    'test',
];
let forceWarnOnLog = false;
export function forceConsoleWarnOnLog(enable) {
    forceWarnOnLog = enable;
}
/**
 * Creates logger instance with tag, and different log levels for production and development.
 *
 * Default levels:
 * - Production: "warn"
 * - Development: "info"
 */
export function createLogger2(tag, levelProd = "warn", levelDev = "info") {
    const level = debugEnvironments.includes(process.env.NODE_ENV) ? LogLevels[levelDev] : LogLevels[levelProd];
    let logger = createConsola({
        formatOptions: {
            columns: 1,
            date: false,
        },
        level,
    })
        .withDefaults({
        level,
    });
    console.log(`Level ${level} of ${JSON.stringify(LogLevels)}`);
    if (forceWarnOnLog) {
        injectLogToWarn(logger);
        logger.log = logger.warn;
    }
    if (typeof tag === "string") {
        logger = logger.withTag(tag);
    }
    else {
        for (const t of tag) {
            logger = logger.withTag(t);
        }
    }
    return logger;
}
function injectLogToWarn(logger) {
    logger.log = logger.warn;
    // @ts-expect-error
    logger._withTag = logger.withTag;
    logger.withTag = function (tag) {
        //console.log(`in custom withTag for log->warn (tag ${tag})`);
        const taggedLogger = this._withTag(tag);
        injectLogToWarn(taggedLogger);
        return taggedLogger;
    };
}
