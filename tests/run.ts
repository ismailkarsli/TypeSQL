import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
if (
	process.env.CI &&
	args.some((a) => a === "-u" || a === "--update" || a.startsWith("--update="))
)
	throw new Error("CI must never update consumer snapshots");
const project = `typesql-consumers-${randomUUID().slice(0, 12)}`;
process.env.TYPESQL_CONSUMER_RUN_ID = project;
const compose = [
	"compose",
	"-f",
	resolve(import.meta.dirname, "environment/compose.yaml"),
	"-p",
	project,
];
const artifacts = resolve(import.meta.dirname, ".artifacts", project);
await mkdir(artifacts, { recursive: true });
const log = createWriteStream(resolve(artifacts, "docker.log"));
let running: ReturnType<typeof spawn> | undefined;
let interrupted = false;
async function docker(argv: string[], timeout = 600_000) {
	return new Promise<number>((done, fail) => {
		running = spawn("docker", [...compose, ...argv], {
			cwd: root,
			stdio: ["ignore", "pipe", "pipe"],
			env: process.env,
		});
		running.stdout!.on("data", (data) => {
			process.stdout.write(data);
			log.write(data);
		});
		running.stderr!.on("data", (data) => {
			process.stderr.write(data);
			log.write(data);
		});
		const timer = setTimeout(() => {
			log.write(`Infrastructure timeout: docker ${argv.join(" ")}\n`);
			running?.kill("SIGKILL");
		}, timeout);
		running.on("error", (e) => {
			clearTimeout(timer);
			fail(e);
		});
		running.on("close", (code) => {
			clearTimeout(timer);
			running = undefined;
			done(code ?? 1);
		});
	});
}
for (const signal of ["SIGINT", "SIGTERM"] as const)
	process.on(signal, () => {
		interrupted = true;
		running?.kill(signal);
	});
try {
	let code = await docker(["build", "suite"]);
	if (!code && !interrupted)
		code = await docker([
			"up",
			"--detach",
			"--wait",
			"--wait-timeout",
			"90",
			"postgres",
		]);
	if (!code && !interrupted)
		code = await docker(
			["run", "--rm", "--no-deps", "suite", ...args],
			3_600_000,
		);
	process.exitCode = interrupted ? 1 : code;
} finally {
	await docker(["logs", "--no-color"], 15_000);
	const cleanup = await docker(
		["down", "--volumes", "--remove-orphans", "--timeout", "5"],
		30_000,
	);
	if (cleanup) process.exitCode = 1;
	await new Promise<void>((done) => log.end(done));
}
