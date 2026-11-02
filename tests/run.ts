import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

const args = process.argv.slice(2);
const { tokens } = parseArgs({
	args,
	options: { update: { type: "boolean", short: "u" } },
	strict: false,
	allowPositionals: true,
	tokens: true,
});
if (
	process.env.CI &&
	tokens.some((t) => t.kind === "option" && t.name === "update")
)
	throw new Error("CI must never update consumer snapshots");
const running = spawn("pnpm", ["exec", "vitest", "run", ...args], {
	cwd: import.meta.dirname,
	stdio: "inherit",
	env: {
		...process.env,
		CONSUMER_ARTIFACTS:
			process.env.CONSUMER_ARTIFACTS ??
			resolve(import.meta.dirname, ".artifacts", randomUUID()),
	},
});
for (const signal of ["SIGINT", "SIGTERM"] as const)
	process.on(signal, () => running.kill(signal));
process.exitCode = await new Promise<number>((done, fail) => {
	running.once("error", fail);
	running.once("close", (code) => done(code ?? 1));
});
