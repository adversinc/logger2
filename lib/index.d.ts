/**
 * Global logger, new version
 */
import { type ConsolaInstance } from "consola";
type LogType = "silent" | "fatal" | "error" | "warn" | "log" | "info" | "success" | "fail" | "ready" | "start" | "box" | "debug" | "trace" | "verbose";
export declare const debugEnvironments: string[];
export declare function forceConsoleWarnOnLog(enable: boolean): void;
/**
 * Creates logger instance with tag, and different log levels for production and development.
 *
 * Default levels:
 * - Production: "warn"
 * - Development: "info"
 */
export declare function createLogger2(tag: string | string[], levelProd?: LogType, levelDev?: LogType): Logger2;
export interface Logger2 extends ConsolaInstance {
}
export {};
