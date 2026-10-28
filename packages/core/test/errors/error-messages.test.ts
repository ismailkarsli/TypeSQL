import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const tsc = resolve(here, "../../../../node_modules/.bin/tsrs");
const project = resolve(here, "tsconfig.json");

/**
 * Compile the error fixture and snapshot the diagnostics (one per line, path-relative).
 * Run `vitest run -u` after an intentional message change and review the diff.
 */
test("compile errors read like Postgres errors", async () => {
	let out = "";
	try {
		execFileSync(tsc, ["-p", project, "--pretty", "false"], {
			encoding: "utf8",
			stdio: "pipe",
		});
	} catch (e) {
		out = String((e as { stdout?: string }).stdout ?? "");
	}
	const lines = out
		.split("\n")
		.filter((l) => l.includes("error TS"))
		.map((l) => l.replace(/^.*fixtures\/errors\.ts/, "errors.ts"));
	expect(lines.length).toBeGreaterThan(0);
	await expect(lines.join("\n")).toMatchFileSnapshot(
		"__snapshots__/errors.txt",
	);
}, 60_000);

/**
 * With TypeScript's default truncation, a long statement's text is cut in the diagnostic. The
 * SqlError leads the parameter type, so every error still shows its message.
 */
test("long statements keep the SqlError visible in truncated diagnostics", () => {
	let out = "";
	try {
		execFileSync(
			tsc,
			["-p", resolve(here, "tsconfig.truncated.json"), "--pretty", "false"],
			{ encoding: "utf8", stdio: "pipe" },
		);
	} catch (e) {
		out = String((e as { stdout?: string }).stdout ?? "");
	}
	const lines = out.split("\n").filter((l) => l.includes("error TS"));
	expect(lines).toHaveLength(3);
	for (const line of lines)
		expect(line).toMatch(/parameter of type 'SqlError<"[^"]/);
	const all = lines.join("\n");
	expect(all).toContain(
		"parameter $5: a number[] value cannot be used as timestamptz[] NOT NULL",
	);
	expect(all).toContain(
		'column \\"tme\\" of relation \\"transaction_item\\" does not exist',
	);
	expect(all).toContain('relation \\"transaction_itm\\" does not exist');
}, 60_000);
