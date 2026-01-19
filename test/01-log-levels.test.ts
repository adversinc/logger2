import { createLogger2, forceConsoleWarnOnLog } from "../src";


forceConsoleWarnOnLog(false);

runWithEnv("");
runWithEnv("development");

function runWithEnv(env: string) {
	process.env.NODE_ENV = env;

	{
		const logger = createLogger2("silent-log", "log", "log");
		logger.log(`This should BE visible (env: ${process.env.NODE_ENV})`);

		const logger2 = logger.withTag("subtag");
		logger2.log(`This should BE visible too (env: ${process.env.NODE_ENV})`);
	}

	{
		const logger = createLogger2("silent-log", "warn", "warn");
		logger.log(`This should not be visible (env: ${process.env.NODE_ENV})`);

		const logger2 = logger.withTag("subtag");
		logger2.log(`This should not be visible too (env: ${process.env.NODE_ENV})`);
		logger2.warn(`This should BE visible (env: ${process.env.NODE_ENV})`);
	}

	{
		const logger = createLogger2("silent-log", "error", "warn");
		logger.warn(`Visible only on "development" (env: ${process.env.NODE_ENV})`);

		const logger2 = logger.withTag("subtag");
		logger2.log(`Not visible on "development" (env: ${process.env.NODE_ENV})`);
		logger2.warn(`Visible only on "development" (env: ${process.env.NODE_ENV})`);
	}
}
