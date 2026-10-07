import { expect, test } from "bun:test";
import * as Sentry from "@sentry/node";
import { connectLoggerSentry, createLogger2 } from "../src/index";

/** Fail without echoing credentials; the integration suite is explicitly opt-in. */
function setting(name: string): string {
	const value = process.env[name];
	if(!value) { throw new Error(`Missing ${name}`); }
	return value;
}

/** Poll only our own event IDs, allowing Sentry's asynchronous ingestion to finish. */
async function readEvent(base: URL, path: string, token: string) {
	for(let attempt = 0; attempt < 45; attempt++) {
		const response = await fetch(new URL(path, base), {
			headers: { Authorization: `Bearer ${token}` },
			redirect: "error",
			signal: AbortSignal.timeout(5000),
		});
		if(response.ok) { return response.json(); }
		if(response.status !== 404) { throw new Error(`Sentry event lookup returned HTTP ${response.status}`); }
		await Bun.sleep(1000);
	}
	throw new Error("Sentry did not index the test event within 45 seconds");
}

test.skipIf(process.env.RUN_SENTRY_LIVE !== "1")("self-hosted Sentry receives details and groups by the stable first argument", async () => {
	const base = new URL(setting("SENTRY_TEST_URL").replace(/\/?$/, "/"));
	if(base.protocol !== "https:" || base.username || base.password) { throw new Error("Sentry URL must use HTTPS without credentials"); }
	const org = encodeURIComponent(setting("SENTRY_TEST_ORG"));
	const project = encodeURIComponent(setting("SENTRY_TEST_PROJECT"));
	const token = setting("SENTRY_TEST_TOKEN");
	const dsn = setting("SENTRY_TEST_DSN");
	const ids: string[] = [];
	const run = crypto.randomUUID();

	// No automatic console/request capture: only synthetic data explicitly logged below is sent.
	const client = Sentry.init({
		dsn,
		environment: "logger2-integration-test",
		defaultIntegrations: false,
		dataCollection: {
			userInfo: false,
			cookies: false,
			httpHeaders: false,
			httpBodies: [],
			urlQueryParams: false,
			stackFrameVariables: false,
			frameContextLines: 0,
		},
		sendClientReports: false,
		beforeSend(event) { ids.push(event.event_id!); return event; },
	});
	const disconnect = connectLoggerSentry(Sentry);

	try {
		const log = createLogger2("logger2-test", "info", "info").setContext({ username: "Synthetic Test User", run });
		log.options.reporters.shift();
		const child = log.withTag("transport").setContext({ botId: 42 });
		child.warn("Synthetic connection warning", "safe diagnostic");
		await client!.flush(5000);
		expect(ids).toHaveLength(0);

		// Separate issues make the two capture paths independently visible in the Sentry UI.
		// Repeated calls within each path still verify stable grouping with different details.
		child.error("API connection error", "synthetic socket failure A");
		child.error("API connection error", "synthetic socket failure B");
		child.error("Logger2 exception integration test", new Error("synthetic exception A"));
		child.error("Logger2 exception integration test", new Error("synthetic exception B"));
		expect(await client!.flush(10000)).toBe(true);
		expect(ids).toHaveLength(4);

		const events = await Promise.all(ids.map(id => readEvent(base, `api/0/projects/${org}/${project}/events/${id}/`, token)));
		const messages = events.filter(event => event.message === "API connection error");
		const exceptions = events.filter(event => event.metadata.type === "Error");
		expect(messages).toHaveLength(2);
		expect(exceptions).toHaveLength(2);
		expect(messages[0].groupID).toBeTruthy();
		expect(messages[0].groupID).toBe(messages[1].groupID);
		expect(exceptions[0].groupID).toBe(exceptions[1].groupID);
		expect(messages[0].groupID).not.toBe(exceptions[0].groupID);
		for(const event of messages) {
			expect(event.title).toBe("API connection error");
			expect(event.tags.find((tag: any) => tag.key === "level")?.value).toBe("error");
			expect(event.entries.some((entry: any) => entry.type === "exception")).toBe(false);
		}
		for(const event of events) {
			expect(event.contexts.logger).toMatchObject({ username: "Synthetic Test User", botId: 42, run });
			const crumbs = event.entries.find((entry: any) => entry.type === "breadcrumbs")?.data.values ?? [];
			expect(crumbs.some((entry: any) => entry.message === "Synthetic connection warning")).toBe(true);
		}
		expect(JSON.stringify(messages)).toContain("synthetic socket failure A");
		expect(JSON.stringify(messages)).toContain("synthetic socket failure B");

		// Check the issue-list title as well, not only individual event payloads.
		const issue = await readEvent(base, `api/0/issues/${messages[0].groupID}/`, token);
		expect(issue.title).toBe("API connection error");
		console.log(`Verified string-only logger.error: ${issue.permalink} (${issue.title})`);
		console.log(`Verified separate Error issue ${exceptions[0].groupID}; 4 events total; run ${run}`);
	} finally {
		disconnect();
		await client!.close(5000);
	}
}, 65000);
