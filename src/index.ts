/**
 * Global logger, new version
 */

import { type ConsolaInstance, type ConsolaOptions, type InputLogObject, type ConsolaReporter, createConsola, LogLevels } from "consola";
import { reportToSentry, snapshot, type LoggerContext, type LoggerHistory } from "./sentry.js";
export { connectLoggerSentry } from "./sentry.js";
export type { LoggerContext, LoggerSentrySDK, LoggerSentryOptions } from "./sentry.js";

// From consola sources
type LogType = "silent" | "fatal" | "error" | "warn" | "log" | "info" | "success" | "fail" | "ready" | "start" | "box" | "debug" | "trace" | "verbose";

export const debugEnvironments = [
	'development',
	'test',
];

let forceWarnOnLog = false;
/** Route ordinary log calls through warn, including descendants created later. */
export function forceConsoleWarnOnLog(enable: boolean) {
	forceWarnOnLog = enable;
}

let defaultLevelProd: LogType = "warn";
let defaultLevelDev: LogType = "info";

export interface CreateLogger2Settings {
	/**
	 * Keep Consola's multi-line object formatting. Defaults to false.
	 */
	allowMultiline?: boolean;
}

/**
 * Set default log levels for production and development environments.
 * These levels will be used if not specified when creating a logger instance.
 */
export function setDefaultLogLevels(levelProd: LogType, levelDev: LogType) {
	defaultLevelProd = levelProd;
	defaultLevelDev = levelDev;
}


/**
 * Creates logger instance with tag, and different log levels for production and development.
 *
 * Default levels:
 * - Production: "warn"
 * - Development: "info"
 */
export function createLogger2(
	tag: string|string[],
	levelProd: LogType = null,
	levelDev: LogType = null,
	settings: CreateLogger2Settings = {},
): Logger2 {
	if(!levelProd) { levelProd = defaultLevelProd; }
	if(!levelDev) { levelDev = defaultLevelDev; }

	const level = debugEnvironments.includes(process.env.NODE_ENV)? LogLevels[levelDev]: LogLevels[levelProd];

	let logger = createConsola({
		formatOptions: {
			columns: 1,
			date: false,
			// `breakLength` is passed to Node's util.inspect by Consola.
			...(settings.allowMultiline ? {} : { breakLength: Infinity }),
		},
		level,
	})
		.withDefaults({
			level,
		});

	if(typeof tag === "string") {
		logger = logger.withTag(tag);
	} else {
		for(const t of tag) {
			logger = logger.withTag(t);
		}
	}

	return decorateLogger(logger, { own: {}, history: { entries: [] } }, forceWarnOnLog);
}

interface ContextNode {
	own: LoggerContext;
	parent?: ContextNode;
	history: LoggerHistory;
}

const sentryReporters = new WeakSet<ConsolaReporter>();

/** Resolve inheritance at emission time; descendants override fields without changing their ancestors. */
function resolveContext(node: ContextNode): LoggerContext {
	return { ...(node.parent ? resolveContext(node.parent) : {}), ...node.own };
}

/** Preserve Consola's factory API while binding each child reporter to its own context node. */
function decorateLogger(logger: ConsolaInstance, node: ContextNode, forceWarn: boolean): Logger2 {
	const result = logger as Logger2;
	const originalCreate = logger.create.bind(logger);
	const reporter: ConsolaReporter = {
		log: entry => reportToSentry(entry, resolveContext(node), node.history),
	};
	sentryReporters.add(reporter);
	logger.options.reporters = logger.options.reporters.filter(item => !sentryReporters.has(item));
	logger.addReporter(reporter);

	result.setContext = context => {
		node.own = { ...node.own, ...snapshot(context) as LoggerContext };
		return result;
	};
	result.create = options => decorateLogger(originalCreate(options), {
		own: {},
		parent: node,
		history: node.history,
	}, forceWarn);

	if(forceWarn) { result.log = result.warn; }
	return result;
}

// This can be type=ConsolaInstance, but it glitches in WebStorm
export interface Logger2 extends ConsolaInstance{
	setContext(context: LoggerContext): Logger2;
	create(options: Partial<ConsolaOptions>): Logger2;
	withTag(tag: string): Logger2;
	withDefaults(defaults: InputLogObject): Logger2;
}
