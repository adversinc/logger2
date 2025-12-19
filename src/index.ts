/**
 * Global logger, new version
 */

import { type ConsolaInstance, createConsola, LogLevels } from "consola";

// From consola sources
type LogType = "silent" | "fatal" | "error" | "warn" | "log" | "info" | "success" | "fail" | "ready" | "start" | "box" | "debug" | "trace" | "verbose";

export const debugEnvironments = [
	'development',
	'test',
];

/**
 * Creates logger instance with tag, and different log levels for production and development.
 *
 * Default levels:
 * - Production: "warn"
 * - Development: "info"
 */
export function createLogger2(tag: string|string[], levelProd: LogType = "warn", levelDev: LogType = "info"): ConsolaInstance {
	let logger = createConsola({
		formatOptions: {
			columns: 1,
			date: false,
		}
	})
		.withDefaults({
			level: debugEnvironments.includes(process.env.NODE_ENV) ? LogLevels[levelProd] : LogLevels[levelDev],
		});

	if(typeof tag === "string") {
		logger = logger.withTag(tag);
	} else {
		for(const t of tag) {
			logger = logger.withTag(t);
		}
	}

	return logger;
}

export type Logger2 = ConsolaInstance;
