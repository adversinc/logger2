/**
 * Global logger, new version
 */
import { createConsola, LogLevels } from "consola";
/**
 * Creates logger instance with tag, and different log levels for production and development.
 *
 * Default levels:
 * - Production: "warn"
 * - Development: "info"
 */
export function createLogger2(tag, levelProd = "warn", levelDev = "info") {
    let logger = createConsola({
        formatOptions: {
            columns: 1,
            date: false,
        }
    })
        .withDefaults({
        level: process.env.NODE_ENV !== "development" ? LogLevels[levelProd] : LogLevels[levelDev],
    });
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
