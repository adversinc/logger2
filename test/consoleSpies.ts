import { spyOn } from "bun:test";

export type StreamSpy = {
	mockImplementation(fn: (...args: any[]) => any): any;
	mockClear(): any;
	mockRestore(): any;
	calls?: any[];
};

export type ConsoleSpies = {
	/** Data written to stdout (typically log/info). */
	stdout: ReturnType<typeof spyOn>;
	/** Data written to stderr (typically warn/error). */
	stderr: ReturnType<typeof spyOn>;
	getStdoutText(): string;
	getStderrText(): string;
};

/**
 * Installs spies on process.stdout/stderr so you can assert if anything was printed.
 * This is more reliable than spying on console.* when libraries write directly to streams.
 */
export function installConsoleSpies(): ConsoleSpies {
	let stdoutText = "";
	let stderrText = "";

	const stdout = spyOn(process.stdout, "write").mockImplementation((chunk: any, ...rest: any[]) => {
		stdoutText += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
		return true;
	});

	const stderr = spyOn(process.stderr, "write").mockImplementation((chunk: any, ...rest: any[]) => {
		stderrText += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
		return true;
	});

	return {
		stdout,
		stderr,
		getStdoutText: () => stdoutText,
		getStderrText: () => stderrText,
	};
}

export function restoreConsoleSpies(spies: ConsoleSpies) {
	spies.stdout.mockRestore();
	spies.stderr.mockRestore();
}

export async function withConsoleSpies<T>(
	fn: (spies: ConsoleSpies) => T | Promise<T>,
): Promise<T> {
	const spies = installConsoleSpies();
	try {
		return await fn(spies);
	} finally {
		restoreConsoleSpies(spies);
	}
}
