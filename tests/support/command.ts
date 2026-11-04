import { AsyncLocalStorage } from "node:async_hooks";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const cancellation = new AsyncLocalStorage<AbortSignal>();
export function withCommands<T>(signal: AbortSignal, run: () => Promise<T>) {
	return cancellation.run(signal, run);
}

export async function unlessMissing<T>(
	work: Promise<T>,
): Promise<T | undefined> {
	try {
		return await work;
	} catch (error) {
		if (!(error instanceof Error && "code" in error && error.code === "ENOENT"))
			throw error;
		return undefined;
	}
}

export interface Result {
	command: string[];
	status: number;
	stdout: string;
	stderr: string;
}
export async function command(
	cwd: string,
	argv: string[],
	env: NodeJS.ProcessEnv = {},
	timeout = 120_000,
): Promise<Result> {
	const signal = cancellation.getStore();
	signal?.throwIfAborted();
	return new Promise((resolve, reject) => {
		// Reuse the workspace-selected pnpm outside the workspace too.
		const executable =
			argv[0] === "pnpm" ? (process.env.npm_execpath ?? "pnpm") : argv[0]!;
		const child = spawn(executable, argv.slice(1), {
			cwd,
			detached: true,
			env: {
				...process.env,
				NODE_PATH: undefined,
				NODE_OPTIONS: undefined,
				TZ: "UTC",
				LANG: "C.UTF-8",
				LC_ALL: "C.UTF-8",
				NO_COLOR: "1",
				CHECKPOINT_DISABLE: "1",
				PRISMA_HIDE_UPDATE_MESSAGE: "1",
				...env,
			},
			stdio: ["ignore", "pipe", "pipe"],
		});
		let stdout = "",
			stderr = "",
			fault: Error | undefined;
		const kill = (reason: string) => {
			fault = new Error(
				`Infrastructure: ${reason}: ${argv.join(" ")} in ${cwd}`,
			);
			if (child.pid) {
				try {
					process.kill(-child.pid, "SIGKILL");
				} catch {}
			}
		};
		const abort = () => kill("test aborted");
		signal?.addEventListener("abort", abort, { once: true });
		const timer = setTimeout(() => kill(`timeout after ${timeout}ms`), timeout);
		child.stdout.on("data", (chunk) => {
			stdout += chunk;
			if (stdout.length > 10_000_000) kill("output exceeded 10MB");
		});
		child.stderr.on("data", (chunk) => {
			stderr += chunk;
			if (stderr.length > 10_000_000) kill("output exceeded 10MB");
		});
		child.on("error", (error) => {
			clearTimeout(timer);
			signal?.removeEventListener("abort", abort);
			reject(
				new Error(`Infrastructure: cannot launch ${argv[0]}`, { cause: error }),
			);
		});
		child.on("close", async (status, exitSignal) => {
			clearTimeout(timer);
			signal?.removeEventListener("abort", abort);
			const result = { command: argv, status: status ?? -1, stdout, stderr };
			try {
				await mkdir(join(cwd, ".scenario", "logs"), { recursive: true });
				await writeFile(
					join(
						cwd,
						".scenario",
						"logs",
						`${argv
							.map((x) => x.replace(/[^a-z0-9-]/gi, "_"))
							.join("-")
							.slice(0, 140)}.json`,
					),
					JSON.stringify(result, null, 2),
				);
				if (fault || exitSignal)
					reject(
						fault ??
							new Error(`Infrastructure: process killed by ${exitSignal}`),
					);
				else resolve(result);
			} catch (error) {
				reject(error);
			}
		});
	});
}
export async function required(
	cwd: string,
	argv: string[],
	env: NodeJS.ProcessEnv = {},
	timeout?: number,
) {
	const result = await command(cwd, argv, env, timeout);
	if (result.status !== 0)
		throw new Error(
			`Infrastructure/prerequisite: ${argv.join(" ")} failed (${result.status})\n${result.stdout}${result.stderr}`,
		);
	return result;
}
