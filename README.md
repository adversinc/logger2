# Advers Logger v2

Consola-based logging for browsers and Node/Bun. Normal logging has no Sentry dependency.

## Sentry connection

Initialize the appropriate Sentry SDK in the application, then connect it once:

```ts
import * as Sentry from "@sentry/node"; // Or the application's browser/Nuxt SDK.
import { connectLoggerSentry, createLogger2 } from "@advers/logger2";

Sentry.init({ dsn: process.env.SENTRY_DSN, defaultIntegrations: false });
const disconnect = connectLoggerSentry(Sentry);

const log = createLogger2("request", "info", "info");
log.setContext({ customerId: 123, username: "Example Resident" });
const apiLog = log.withTag("api").setContext({ botId: 42 });
apiLog.warn("HTTP request failed", "status=404");
log.error("Bot verification failed", "Keeping previous status");
```

- Existing instances and future descendants use the connection. Repeating the same connection is idempotent.
- `error` and `fatal` send events. Other enabled levels become breadcrumbs and do not send independent events.
- The first string argument is the stable event title and entire fingerprint. Put changing details in later arguments.
- Context and logger tags do not affect grouping. Passing an `Error` preserves its original stack frames;
  its sanitized message remains in event details. An `Error` without an explicit title keeps SDK default grouping.
- Do not enable console capture for the same logger output, or console breadcrumbs that duplicate this history.
  Automatic SDK integrations and their privacy settings remain the application's responsibility.
- Current Consola level filtering and repeated-message throttling still apply. A filtered `info` call is not retained.
- The console keeps normal formatting. Context is attached to telemetry, not appended to console lines.
- SDK/redactor failures do not throw back to the application or recursively report themselves.

## Inherited context and history

`setContext()` shallow-merges fields and returns the logger. Descendants created with `withTag()`,
`withDefaults()` or `create()` inherit current ancestor fields and may override them locally.
Parent updates affect subsequent child messages, never already retained breadcrumb snapshots.
Input context is copied; later mutations of the supplied object do not change it.

A root logger and all its descendants share one bounded history (50 messages by default).
**Create a new root logger per independent server request/operation.** Never attach user context to a
module-global logger or share that root's descendants across concurrent users. Tags alone do not isolate history.
Separate roots never share logger breadcrumbs. Context is applied in a temporary Sentry scope, not globally.
When the SDK exposes `getIsolationScope()`, history is additionally isolated by the active request scope.
This protects module-level diagnostic loggers too. Configure the framework's Sentry request isolation;
it does not make mutable user context on a shared logger safe.

```ts
connectLoggerSentry(Sentry, {
	maxBreadcrumbs: 50, // 0–100; zero disables retained history.
	redact: text => text.replaceAll("application-specific-secret", "[REDACTED]"),
});
```

Only send explicitly selected diagnostic values, never whole entities, credentials, requests or responses.
Telemetry copies omit getters and non-plain objects, redact common sensitive field names and bound size/depth.
This is defense in depth, **not a guarantee that arbitrary text is secret-free**. Use `redact` for application-specific
values and sanitize at the source. These safeguards do not sanitize the existing console reporter's output.
Reconnecting a different SDK/redactor clears retained history before it can reach the new destination.

## Tests

```sh
bun run build
bun test test
```

Unit tests include the actual Sentry SDK with an in-memory transport; no network traffic is sent.
For an opt-in delivery test, copy `.env.sentry-test.example` to `.env.sentry-test` and fill in a dedicated test
project's DSN plus an API token with `project:read`. The URL must include `https://`.

```sh
bun run test:sentry
```

This sends four synthetic error events into two separate issues: string-only `logger.error("API connection error", …)`
and `logger.error` with an `Error`. It checks distinct issues, grouping within each pair, the message issue's actual
display title, context and history through the Sentry API.
It does not send real user data, alter project settings or delete events. The test events remain in the test project.
Ordinary `bun test` skips this live test. Do not put production credentials in the test env file.
