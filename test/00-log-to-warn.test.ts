import { createLogger2, forceConsoleWarnOnLog } from "../src";

forceConsoleWarnOnLog(true);

const logger = createLogger2("test-log-to-warn");

logger.log("this is log");
logger.warn("this is warn");

const logger2 = logger.withTag("subtag");

logger2.log("this is log from subtag");
logger2.warn("this is warn from subtag");

