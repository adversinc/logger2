import { test, expect } from "bun:test";
import { withConsoleSpies } from "./consoleSpies";

test("forceConsoleWarnOnLog(true) routes .log() to warn output (including tagged loggers)", async () => {
	await withConsoleSpies(async (spies) => {
		const { createLogger2, forceConsoleWarnOnLog } = await import("../src");
		forceConsoleWarnOnLog(true);

		const logger = createLogger2("test-log-to-warn");

		logger.log("this is log");
		logger.warn("this is warn");

		const logger2 = logger.withTag("subtag");
		logger2.log("this is log from subtag");
		logger2.warn("this is warn from subtag");

		// When log is redirected to warn, output should go to stderr, not stdout.
		expect(spies.stdout).not.toHaveBeenCalled();
		expect(spies.stderr).toHaveBeenCalled();
		expect(spies.getStderrText()).toContain("this is log");
	});
});
