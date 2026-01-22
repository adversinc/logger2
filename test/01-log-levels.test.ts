import { describe, test, expect, beforeAll } from "bun:test";
import { withConsoleSpies } from "./consoleSpies";

runWithEnv("");
runWithEnv("development");

function runWithEnv(env: string) {
	describe(`log levels (NODE_ENV=${env || "(empty)"})`, () => {
		beforeAll(() => {
			process.env.NODE_ENV = env;
		});

		test("level=log/log => log is visible (tag + subtag)", async () => {
			await withConsoleSpies(async (spies) => {
				const { createLogger2, forceConsoleWarnOnLog } = await import("../src");
				forceConsoleWarnOnLog(false);

				const logger = createLogger2("silent-log", "log", "log");
				logger.log(`This should BE visible (env: ${process.env.NODE_ENV})`);
				const logger2 = logger.withTag("subtag");
				logger2.log(`This should BE visible too (env: ${process.env.NODE_ENV})`);

				expect(spies.stdout).toHaveBeenCalledTimes(2);
				expect(spies.getStdoutText()).toContain("This should BE visible");
			});
		});

		test("level=warn/warn => log is suppressed, warn is visible", async () => {
			await withConsoleSpies(async (spies) => {
				const { createLogger2, forceConsoleWarnOnLog } = await import("../src");
				forceConsoleWarnOnLog(false);

				const logger = createLogger2("silent-log", "warn", "warn");
				logger.log(`This should not be visible (env: ${process.env.NODE_ENV})`);
				const logger2 = logger.withTag("subtag");
				logger2.log(`This should not be visible too (env: ${process.env.NODE_ENV})`);
				logger2.warn(`This should BE visible (env: ${process.env.NODE_ENV})`);

				expect(spies.stdout).toHaveBeenCalledTimes(0);
				expect(spies.stderr).toHaveBeenCalledTimes(1);
				expect(spies.getStderrText()).toContain("This should BE visible");
			});
		});

		test("level=error/warn => warn only visible in development", async () => {
			await withConsoleSpies(async (spies) => {
				const { createLogger2, forceConsoleWarnOnLog } = await import("../src");
				forceConsoleWarnOnLog(false);

				const logger = createLogger2("silent-log", "error", "warn");
				logger.warn(`Visible only on "development" (env: ${process.env.NODE_ENV})`);

				const logger2 = logger.withTag("subtag");
				logger2.log(`Not visible on "development" (env: ${process.env.NODE_ENV})`);
				logger2.warn(`Visible only on "development" (env: ${process.env.NODE_ENV})`);

				if (process.env.NODE_ENV === "development") {
					expect(spies.stderr).toHaveBeenCalledTimes(2);
					expect(spies.getStderrText()).toContain('Visible only on "development"');
				} else {
					expect(spies.stderr).toHaveBeenCalledTimes(0);
				}

				expect(spies.stdout).toHaveBeenCalledTimes(0);
			});
		});
	});
}
