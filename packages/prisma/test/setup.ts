import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/** Generates the Prisma Client fixture (`test/fixtures/client`, gitignored) the type tests import. */
export default function setup(): void {
	const pkg = fileURLToPath(new URL("..", import.meta.url));
	execFileSync(
		fileURLToPath(new URL("../node_modules/.bin/prisma", import.meta.url)),
		[
			"generate",
			"--schema",
			"test/fixtures/schema.prisma",
			"--generator",
			"client",
			"--no-hints",
		],
		{
			cwd: pkg,
			env: { ...process.env, CHECKPOINT_DISABLE: "1" },
			stdio: "ignore",
		},
	);
}
