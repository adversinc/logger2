import type { LogObject } from "consola";

export type LoggerContext = Record<string, unknown>;
type Severity = "debug" | "info" | "warning" | "error" | "fatal";

interface Breadcrumb {
	timestamp: number;
	category: string;
	message: string;
	level: Severity;
	data: Record<string, unknown>;
}

/** Structural SDK boundary: applications supply their already initialized browser/Node/Nuxt SDK. */
export interface LoggerSentryScope {
	addBreadcrumb(breadcrumb: Breadcrumb): unknown;
	setContext(name: string, context: Record<string, unknown>): unknown;
	setExtra(name: string, value: unknown): unknown;
	setTag(name: string, value: string): unknown;
	setLevel(level: Severity): unknown;
	setFingerprint(fingerprint: string[]): unknown;
}

export interface LoggerSentrySDK {
	/** Modern server SDKs expose the request-local isolation scope. */
	getIsolationScope?(): object;
	withScope<T>(callback: (scope: LoggerSentryScope) => T): T;
	captureEvent(event: { message: string; level: Severity }): string;
	captureException(error: unknown): string;
}

export interface LoggerSentryOptions {
	/** Bounded history shared by a root logger and its descendants. Default: 50. Maximum: 100. */
	maxBreadcrumbs?: number;
	/** Optional application-specific redaction, applied before retaining or sending strings. */
	redact?: (text: string) => string;
}

interface Connection {
	sdk: LoggerSentrySDK;
	maxBreadcrumbs: number;
	redact?: (text: string) => string;
}

export interface LoggerHistory {
	connection?: Connection;
	entries: Breadcrumb[];
	scopes?: WeakMap<object, Breadcrumb[]>;
}

let connection: Connection | undefined;
let reporting = false;
const sensitiveKey = /password|passwd|secret|token|api.?key|securitycode|clientkey|cookie|authorization/i;

/** Connect once globally, including existing loggers; the returned disposer cannot disconnect a newer SDK. */
export function connectLoggerSentry(sdk: LoggerSentrySDK, options: LoggerSentryOptions = {}): () => void {
	const maxBreadcrumbs = options.maxBreadcrumbs ?? 50;
	if(!Number.isInteger(maxBreadcrumbs) || maxBreadcrumbs < 0 || maxBreadcrumbs > 100) {
		throw new RangeError("maxBreadcrumbs must be an integer between 0 and 100");
	}
	if(connection?.sdk !== sdk || connection.maxBreadcrumbs !== maxBreadcrumbs || connection.redact !== options.redact) {
		connection = { sdk, maxBreadcrumbs, redact: options.redact };
	}
	const active = connection;

	return () => {
		if(connection === active) {
			connection = undefined;
		}
	};
}

/** Copy bounded diagnostic values without getters, cycles, class instances or secret-bearing fields. */
export function snapshot(value: unknown, redact?: (text: string) => string): unknown {
	let remaining = 200;
	const seen = new WeakSet<object>();

	/** Enforce a shared traversal budget so wide nested objects cannot inflate telemetry indefinitely. */
	function copy(input: unknown, depth: number): unknown {
		if(--remaining < 0 || depth > 5) { return "[Truncated]"; }
		if(typeof input === "string") {
			const text = input.slice(0, 4096).replace(
				/\b(password|passwd|secret|token|apikey|api_key|securitycode|sb_securitycode|clientkey|authorization)\s*[:=]\s*[^\s,;]+/gi,
				"$1=[REDACTED]",
			).replace(/\bBearer\s+[^\s,;]+/gi, "Bearer [REDACTED]");
			return (redact ? redact(text) : text).slice(0, 2048);
		}
		if(input === null || typeof input === "boolean" || typeof input === "number") { return input; }
		if(typeof input === "bigint") { return String(input); }
		if(typeof input !== "object") { return undefined; }
		if(seen.has(input)) { return "[Circular]"; }
		seen.add(input);

		if(input instanceof Error) {
			return { name: copy(input.name, depth + 1), message: copy(input.message, depth + 1),
				stack: copy(input.stack, depth + 1) };
		}
		if(Array.isArray(input)) { return input.slice(0, 20).map(item => copy(item, depth + 1)); }
		if(Object.getPrototypeOf(input) !== Object.prototype && Object.getPrototypeOf(input) !== null) {
			return "[Non-plain object]";
		}

		const result: Record<string, unknown> = Object.create(null);
		for(const key of Object.keys(input).slice(0, 30)) {
			const descriptor = Object.getOwnPropertyDescriptor(input, key);
			if(sensitiveKey.test(key)) { result[key] = "[REDACTED]"; }
			else if(descriptor && "value" in descriptor) { result[key] = copy(descriptor.value, depth + 1); }
		}
		return result;
	}

	return copy(value, 0);
}

/** Map presentation types to Sentry levels without turning ordinary warnings into independent issues. */
function severity(type: string): Severity {
	if(type === "fatal") { return "fatal"; }
	if(type === "error") { return "error"; }
	if(type === "warn") { return "warning"; }
	if(["debug", "trace", "verbose"].includes(type)) { return "debug"; }
	return "info";
}

/** Record local history or report an error using an event-local scope, never a global user context. */
export function reportToSentry(log: LogObject, context: LoggerContext, history: LoggerHistory): void {
	const active = connection;
	if(!active || reporting) { return; }
	reporting = true;

	try {
		// A reconnect must not send history collected for a different destination or redaction policy.
		if(history.connection !== active) {
			history.connection = active;
			history.entries = [];
			history.scopes = new WeakMap();
		}
		// Module-level loggers may serve many users. Keep their breadcrumbs request-local too.
		const isolationScope = active.sdk.getIsolationScope?.();
		let entries = history.entries;
		if(isolationScope) {
			entries = history.scopes!.get(isolationScope) ?? [];
			history.scopes!.set(isolationScope, entries);
		}
		const args = snapshot(log.args, active.redact) as unknown[];
		const safeContext = snapshot(context, active.redact) as LoggerContext;
		const first = args[0];
		const originalError = log.args.find(arg => arg instanceof Error) as Error | undefined;
		const title = typeof first === "string" ? first : originalError ? String(snapshot(originalError.message, active.redact)) : "Logger error";
		const category = String(snapshot(log.tag, active.redact));
		const level = severity(log.type);
		const breadcrumb: Breadcrumb = {
			timestamp: log.date.getTime() / 1000,
			category,
			message: title,
			level,
			data: { arguments: args, context: safeContext },
		};

		if(level === "error" || level === "fatal") {
			active.sdk.withScope(scope => {
				scope.setLevel(level);
				scope.setTag("logger", category);
				scope.setContext("logger", safeContext);
				scope.setExtra("arguments", args);
				if(typeof first === "string") { scope.setFingerprint([first]); }
				for(const entry of entries) { scope.addBreadcrumb(entry); }

				if(originalError) {
					// Preserve original call frames without passing its arbitrary fields/cause to the SDK.
					const safe = snapshot(originalError, active.redact) as Record<string, string>;
					const error = new Error(title);
					error.name = typeof first === "string" ? "Error" : safe.name;
					if(safe.stack) {
						error.stack = `${error.name}: ${title}\n${safe.stack.split("\n").slice(1).join("\n")}`;
					}
					active.sdk.captureException(error);
				} else {
					// Send a message event without the synthetic exception added by captureMessage in SDK v11.
					// Otherwise self-hosted Sentry may use a logger stack frame ("<anonymous>") as the issue title.
					active.sdk.captureEvent({ message: title, level });
				}
			});
		}

		entries.push(breadcrumb);
		if(entries.length > active.maxBreadcrumbs) {
			entries.splice(0, entries.length - active.maxBreadcrumbs);
		}
	} catch {
		// A telemetry failure must neither break the caller nor recursively log itself.
	} finally {
		reporting = false;
	}
}
