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

let forceWarnOnLog = false;
export function forceConsoleWarnOnLog(enable: boolean) {
	forceWarnOnLog = enable;
}

/**
 * Creates logger instance with tag, and different log levels for production and development.
 *
 * Default levels:
 * - Production: "warn"
 * - Development: "info"
 */
export function createLogger2(tag: string|string[], levelProd: LogType = "warn", levelDev: LogType = "info"): Logger2 {
	const level = debugEnvironments.includes(process.env.NODE_ENV)? LogLevels[levelDev]: LogLevels[levelProd];

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

	if(forceWarnOnLog) {
		injectLogToWarn(logger);
		logger.log = logger.warn;
	}

	if(typeof tag === "string") {
		logger = logger.withTag(tag);
	} else {
		for(const t of tag) {
			logger = logger.withTag(t);
		}
	}

	return logger;
}

function injectLogToWarn(logger: ConsolaInstance): void {
	logger.log = logger.warn;

	// @ts-expect-error
	logger._withTag = logger.withTag;
	logger.withTag = function(tag: string) {
		//console.log(`in custom withTag for log->warn (tag ${tag})`);
		const taggedLogger = this._withTag(tag);
		injectLogToWarn(taggedLogger);

		return taggedLogger;
	};
}

// This can be type=ConsolaInstance, but it glitches in WebStorm
export interface Logger2 extends ConsolaInstance{

}
