/**
 * Global logger, new version
 */
import { createConsola, LogLevels } from "consola";
import { reportToSentry, snapshot } from "./sentry.js";
export { connectLoggerSentry } from "./sentry.js";
export const debugEnvironments = [
    'development',
    'test',
];
let forceWarnOnLog = false;
/** Route ordinary log calls through warn, including descendants created later. */
export function forceConsoleWarnOnLog(enable) {
    forceWarnOnLog = enable;
}
let defaultLevelProd = "warn";
let defaultLevelDev = "info";
/**
 * Set default log levels for production and development environments.
 * These levels will be used if not specified when creating a logger instance.
 */
export function setDefaultLogLevels(levelProd, levelDev) {
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
export function createLogger2(tag, levelProd = null, levelDev = null, settings = {}) {
    if (!levelProd) {
        levelProd = defaultLevelProd;
    }
    if (!levelDev) {
        levelDev = defaultLevelDev;
    }
    const level = debugEnvironments.includes(process.env.NODE_ENV) ? LogLevels[levelDev] : LogLevels[levelProd];
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
    if (typeof tag === "string") {
        logger = logger.withTag(tag);
    }
    else {
        for (const t of tag) {
            logger = logger.withTag(t);
        }
    }
    return decorateLogger(logger, { own: {}, history: { entries: [] } }, forceWarnOnLog);
}
const sentryReporters = new WeakSet();
/** Resolve inheritance at emission time; descendants override fields without changing their ancestors. */
function resolveContext(node) {
    return { ...(node.parent ? resolveContext(node.parent) : {}), ...node.own };
}
/** Preserve Consola's factory API while binding each child reporter to its own context node. */
function decorateLogger(logger, node, forceWarn) {
    const result = logger;
    const originalCreate = logger.create.bind(logger);
    const reporter = {
        log: entry => reportToSentry(entry, resolveContext(node), node.history),
    };
    sentryReporters.add(reporter);
    logger.options.reporters = logger.options.reporters.filter(item => !sentryReporters.has(item));
    logger.addReporter(reporter);
    result.setContext = context => {
        node.own = { ...node.own, ...snapshot(context) };
        return result;
    };
    result.create = options => decorateLogger(originalCreate(options), {
        own: {},
        parent: node,
        history: node.history,
    }, forceWarn);
    if (forceWarn) {
        result.log = result.warn;
    }
    return result;
}
