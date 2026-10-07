import type { LogObject } from "consola";
export type LoggerContext = Record<string, unknown>;
type Severity = "debug" | "info" | "warning" | "error" | "fatal";
interface Breadcrumb {
    timestamp: number;
    category: string;
    message: string;
    level: Severity;
    data: Record<string, unknown>;
}
/** Structural SDK boundary: applications supply their already initialized browser/Node/Nuxt SDK. */
export interface LoggerSentryScope {
    addBreadcrumb(breadcrumb: Breadcrumb): unknown;
    setContext(name: string, context: Record<string, unknown>): unknown;
    setExtra(name: string, value: unknown): unknown;
    setTag(name: string, value: string): unknown;
    setLevel(level: Severity): unknown;
    setFingerprint(fingerprint: string[]): unknown;
}
export interface LoggerSentrySDK {
    /** Modern server SDKs expose the request-local isolation scope. */
    getIsolationScope?(): object;
    withScope<T>(callback: (scope: LoggerSentryScope) => T): T;
    captureEvent(event: {
        message: string;
        level: Severity;
    }): string;
    captureException(error: unknown): string;
}
export interface LoggerSentryOptions {
    /** Bounded history shared by a root logger and its descendants. Default: 50. Maximum: 100. */
    maxBreadcrumbs?: number;
    /** Optional application-specific redaction, applied before retaining or sending strings. */
    redact?: (text: string) => string;
}
interface Connection {
    sdk: LoggerSentrySDK;
    maxBreadcrumbs: number;
    redact?: (text: string) => string;
}
export interface LoggerHistory {
    connection?: Connection;
    entries: Breadcrumb[];
    scopes?: WeakMap<object, Breadcrumb[]>;
}
/** Connect once globally, including existing loggers; the returned disposer cannot disconnect a newer SDK. */
export declare function connectLoggerSentry(sdk: LoggerSentrySDK, options?: LoggerSentryOptions): () => void;
/** Copy bounded diagnostic values without getters, cycles, class instances or secret-bearing fields. */
export declare function snapshot(value: unknown, redact?: (text: string) => string): unknown;
/** Record local history or report an error using an event-local scope, never a global user context. */
export declare function reportToSentry(log: LogObject, context: LoggerContext, history: LoggerHistory): void;
export {};
