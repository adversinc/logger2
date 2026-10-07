import { afterEach, describe, expect, test } from "bun:test";
import * as Sentry from "@sentry/node";
import { connectLoggerSentry, createLogger2, forceConsoleWarnOnLog } from "../src/index";
import type { LoggerSentrySDK, LoggerSentryScope } from "../src/sentry";

let disconnect: (() => void) | undefined;
afterEach(() => { disconnect?.(); forceConsoleWarnOnLog(false); });

/** A deterministic SDK boundary records only explicit capture calls, never console output. */
function recorder() {
	const events: any[] = [];
	let current: any;
	const sdk: LoggerSentrySDK = {
		withScope(callback) {
			current = { breadcrumbs: [] };
			const scope: LoggerSentryScope = {
				addBreadcrumb: value => current.breadcrumbs.push(value),
				setContext: (_key, value) => { current.context = value; },
				setExtra: (_key, value) => { current.arguments = value; },
				setTag: (_key, value) => { current.tag = value; },
				setLevel: value => { current.level = value; },
				setFingerprint: value => { current.fingerprint = value; },
			};
			return callback(scope);
		},
		captureEvent(event) { events.push({ ...current, ...event }); return String(events.length); },
		captureException(error) { events.push({ ...current, error }); return String(events.length); },
	};
	return { events, sdk };
}

/** Silence terminal output without removing the telemetry reporter. */
function logger(tag = "test", level: "debug" | "warn" = "debug") {
	const log = createLogger2(tag, level, level);
	log.options.reporters.shift();
	return log;
}

describe("logger context and Sentry", () => {
	test("connects existing descendants, groups by the first argument, and sends history only on errors", () => {
		const log = logger().withTag("api");
		const { sdk, events } = recorder();
		disconnect = connectLoggerSentry(sdk);
		log.log("Starting request", 1);
		log.info("Request queued");
		log.debug("Endpoint selected");
		log.warn("HTTP request failed", 404);
		expect(events).toHaveLength(0);
		log.error("API connection error", "socket failed");
		log.error("API connection error", "another failure");
		expect(events).toHaveLength(2);
		expect(events[0].fingerprint).toEqual(["API connection error"]);
		expect(events[1].fingerprint).toEqual(events[0].fingerprint);
		expect(events[0].arguments).toEqual(["API connection error", "socket failed"]);
		expect(events[0].breadcrumbs.map((b: any) => b.message)).toEqual([
			"Starting request", "Request queued", "Endpoint selected", "HTTP request failed",
		]);
		expect(events[0].tag).toBe("test:api");
	});

	test("inherits live parent context with child overrides and immutable emitted snapshots", () => {
		const { sdk, events } = recorder();
		disconnect = connectLoggerSentry(sdk);
		const root = logger().setContext({ customerId: 1, username: "Alice", nested: { count: 1 } });
		const child = root.withTag("bot").setContext({ botId: 45, username: "Bot owner" });
		const sibling = root.withDefaults({ tag: "other" });
		child.warn("Before update");
		root.setContext({ customerId: 2, nested: { count: 2 } });
		child.error("Child failure");
		sibling.error("Sibling failure");
		root.error("Root failure");
		expect(events[0].context).toEqual({ customerId: 2, username: "Bot owner", nested: { count: 2 }, botId: 45 });
		expect(events[0].breadcrumbs[0].data.context.customerId).toBe(1);
		expect(events[1].context.username).toBe("Alice");
		expect(events[1].context.botId).toBeUndefined();
		expect(events[2].context.botId).toBeUndefined();
	});

	test("keeps histories and contexts separate for concurrent independent roots", async () => {
		const { sdk, events } = recorder();
		disconnect = connectLoggerSentry(sdk);
		await Promise.all([1, 2].map(async customerId => {
			const log = logger("request").setContext({ customerId });
			log.withTag("http").warn("Transport failed", customerId);
			await Promise.resolve();
			log.error("Request failed");
		}));
		for(const event of events) {
			expect(event.breadcrumbs).toHaveLength(1);
			expect(event.breadcrumbs[0].data.context.customerId).toBe(event.context.customerId);
		}
	});

	test("retains safe stack frames but never passes arbitrary Error fields or cause to Sentry", () => {
		const { sdk, events } = recorder();
		disconnect = connectLoggerSentry(sdk);
		const error = Object.assign(new Error("socket failed", { cause: { secret: "hidden" } }), { password: "hidden" });
		logger().error("API failure", error);
		expect(events[0].error.message).toBe("API failure");
		expect(events[0].error.stack).toContain("02-sentry.test.ts");
		expect(events[0].arguments[1].message).toBe("socket failed");
		expect(events[0].error.cause).toBeUndefined();
		expect(events[0].error.password).toBeUndefined();
	});

	test("an Error without an explicit title retains default SDK grouping", () => {
		const { sdk, events } = recorder();
		disconnect = connectLoggerSentry(sdk);
		logger().error(new TypeError("Broken input"));
		expect(events[0].fingerprint).toBeUndefined();
		expect(events[0].error.name).toBe("TypeError");
	});

	test("redacts secrets, bounds values and skips getters/cycles", () => {
		const { sdk, events } = recorder();
		disconnect = connectLoggerSentry(sdk, { redact: text => text.replaceAll("private-value", "[REDACTED]") });
		const context: any = { password: "private-password", nested: { sb_securitycode: "private-code" } };
		context.self = context;
		Object.defineProperty(context, "getter", { enumerable: true, get() { throw Error("Do not invoke"); } });
		logger().setContext(context).error("Failure", "private-value", { apiKey: "private-key", huge: "x".repeat(10000) });
		const result = JSON.stringify(events);
		expect(result).not.toContain("private-");
		expect(result).toContain("[Circular]");
		expect(events[0].arguments[2].huge.length).toBeLessThanOrEqual(2048);
	});

	test("repeated connection does not duplicate events or discard history", () => {
		const { sdk, events } = recorder();
		disconnect = connectLoggerSentry(sdk);
		const log = logger();
		log.warn("Before reconnect");
		disconnect = connectLoggerSentry(sdk);
		log.error("Failure");
		expect(events).toHaveLength(1);
		expect(events[0].breadcrumbs).toHaveLength(1);
		disconnect();
		log.error("Disconnected");
		expect(events).toHaveLength(1);
	});

	test("old disposer cannot disconnect a replacement SDK and old history is not forwarded", () => {
		const first = recorder();
		const second = recorder();
		const oldDisconnect = connectLoggerSentry(first.sdk);
		const log = logger();
		log.warn("Old destination");
		disconnect = connectLoggerSentry(second.sdk);
		oldDisconnect();
		log.error("New destination");
		expect(first.events).toHaveLength(0);
		expect(second.events[0].breadcrumbs).toHaveLength(0);
	});

	test("keeps a bounded history and respects existing log levels", () => {
		const { sdk, events } = recorder();
		disconnect = connectLoggerSentry(sdk, { maxBreadcrumbs: 2 });
		const log = logger("filtered", "warn");
		log.warn("First"); log.warn("Second"); log.warn("Third"); log.info("Filtered");
		log.fatal("Fatal failure");
		expect(events[0].level).toBe("fatal");
		expect(events[0].breadcrumbs.map((b: any) => b.message)).toEqual(["Second", "Third"]);
	});

	test("SDK/redactor failures cannot break application logging or recursively report", () => {
		const { sdk, events } = recorder();
		const log = logger();
		sdk.captureEvent = () => { log.error("Recursive SDK error"); throw Error("SDK down"); };
		disconnect = connectLoggerSentry(sdk);
		expect(() => log.error("Original error")).not.toThrow();
		expect(events).toHaveLength(0);
		disconnect = connectLoggerSentry(sdk, { redact() { throw Error("Redactor failed"); } });
		expect(() => log.warn("Normal warning")).not.toThrow();
	});
});

test("real Sentry SDK produces envelopes with stable grouping, contexts and no warn-only event", async () => {
	const envelopes: any[] = [];
	const client = Sentry.init({
		dsn: "https://test@example.invalid/1",
		defaultIntegrations: false,
		sendClientReports: false,
		transport: () => ({ send: async envelope => { envelopes.push(envelope); return {}; }, flush: async () => true }),
	});
	disconnect = connectLoggerSentry(Sentry);
	const log = logger().setContext({ customerId: 123 });
	log.withTag("transport").warn("HTTP request failed", 404);
	await client!.flush(1000);
	expect(envelopes).toHaveLength(0);

	log.error("API connection error", new Error("socket failed"));
	log.error("API connection error", "second failure");
	await client!.flush(1000);
	const events = envelopes.flatMap(envelope => envelope[1].filter((item: any) => item[0].type === "event").map((item: any) => item[1]));
	expect(events).toHaveLength(2);
	expect(events[0].fingerprint).toEqual(["API connection error"]);
	expect(events[1].fingerprint).toEqual(events[0].fingerprint);
	expect(events[1].message).toBe("API connection error");
	expect(events[1].level).toBe("error");
	expect(events[1].exception).toBeUndefined();
	expect(events[0].contexts.logger.customerId).toBe(123);
	expect(events[0].breadcrumbs[0].message).toBe("HTTP request failed");
	expect(events[0].exception.values[0].stacktrace.frames.length).toBeGreaterThan(0);
	await client!.close(1000);
});

test("a shared module logger cannot mix breadcrumbs between real SDK request isolation scopes", async () => {
	const events: any[] = [];
	const client = Sentry.init({
		dsn: "https://test@example.invalid/1",
		defaultIntegrations: false,
		sendClientReports: false,
		beforeSend(event) { events.push(event); return null; },
	});
	disconnect = connectLoggerSentry(Sentry);
	const root = logger("module");
	await Promise.all(["Alice", "Bob"].map(name => Sentry.withIsolationScope(async () => {
		root.warn("Request diagnostic", name);
		await Promise.resolve();
		root.error("Request failure", name);
	})));
	await client!.flush(1000);
	for(const event of events) {
		expect(event.breadcrumbs).toHaveLength(1);
		expect(event.breadcrumbs[0].data.arguments[1]).toBe(event.extra.arguments[1]);
	}
	expect(events).toHaveLength(2);
	await client!.close(1000);
});
