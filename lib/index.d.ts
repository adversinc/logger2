/**
 * Global logger, new version
 */
import { type ConsolaInstance } from "consola";
type LogType = "silent" | "fatal" | "error" | "warn" | "log" | "info" | "success" | "fail" | "ready" | "start" | "box" | "debug" | "trace" | "verbose";
/**
 * Creates logger instance with tag, and different log levels for production and development.
 *
 * Default levels:
 * - Production: "warn"
 * - Development: "info"
 */
export declare function createLogger2(tag: string | string[], levelProd?: LogType, levelDev?: LogType): ConsolaInstance;
export type Logger2 = ConsolaInstance;
export {};
