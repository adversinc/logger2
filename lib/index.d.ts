/**
 * Global logger, new version
 */
import { type ConsolaInstance, type ConsolaOptions, type InputLogObject } from "consola";
import { type LoggerContext } from "./sentry.js";
export { connectLoggerSentry } from "./sentry.js";
export type { LoggerContext, LoggerSentrySDK, LoggerSentryOptions } from "./sentry.js";
type LogType = "silent" | "fatal" | "error" | "warn" | "log" | "info" | "success" | "fail" | "ready" | "start" | "box" | "debug" | "trace" | "verbose";
export declare const debugEnvironments: string[];
/** Route ordinary log calls through warn, including descendants created later. */
export declare function forceConsoleWarnOnLog(enable: boolean): void;
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
export declare function setDefaultLogLevels(levelProd: LogType, levelDev: LogType): void;
/**
 * Creates logger instance with tag, and different log levels for production and development.
 *
 * Default levels:
 * - Production: "warn"
 * - Development: "info"
 */
export declare function createLogger2(tag: string | string[], levelProd?: LogType, levelDev?: LogType, settings?: CreateLogger2Settings): Logger2;
export interface Logger2 extends ConsolaInstance {
    setContext(context: LoggerContext): Logger2;
    create(options: Partial<ConsolaOptions>): Logger2;
    withTag(tag: string): Logger2;
    withDefaults(defaults: InputLogObject): Logger2;
}
