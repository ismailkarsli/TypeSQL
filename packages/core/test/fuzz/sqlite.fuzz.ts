import { join, relative } from "node:path";
import { expect, test } from "vitest";
import {
	compareBaseline,
	readBaseline,
	showEntries,
	writeBaseline,
} from "../oracle/baseline.js";
import { generate } from "../sqlite/gen.js";
import { readCorpus, runOracle } from "../sqlite/oracle.js";

const CI_SEED = 1;
const CI_RUNS = 1000;
const seed = Number(process.env["TYPESQL_FUZZ_SEED"] ?? CI_SEED);
const runs = Number(process.env["TYPESQL_FUZZ_RUNS"] ?? CI_RUNS);
const isCiRun = seed === CI_SEED && runs === CI_RUNS;
const root = join(import.meta.dirname, "../../../..");
const path = join(import.meta.dirname, "sqlite-baseline.json");

test("fuzz: generated SQLite statements against SQLite", async (ctx) => {
	if (process.env["TYPESQL_FUZZ_REPLAY"])
		return ctx.skip("--replay replays PostgreSQL statements");
	const { schemas } = readCorpus();
	const statements = generate(seed, runs);
	const r = await runOracle((m) => console.log(m), { schemas, statements });
	const tally = Object.entries(r.tally)
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([k, n]) => `${k}: ${n}`)
		.join(", ");
	console.log(`sqlite fuzz, seed ${seed}: ${tally}`);
	const show = (list: Parameters<typeof showEntries>[0]) =>
		showEntries(
			list,
			(e) =>
				`  ${e.group}  [${e.kind}]  ${String(e.sql)}\n      ${String(e.detail)}`,
		);
	if (!isCiRun) {
		const found = Object.entries(r.entries).flatMap(([group, list]) =>
			list.map((e) => ({ ...e, group })),
		);
		expect(show(found)).toBe("");
		return;
	}
	const cmd = "pnpm fuzz --update";
	if (process.env["TYPESQL_FUZZ_UPDATE"] === "1") {
		writeBaseline(path, { seed, runs }, "disagreements", r.entries);
		console.log(`Wrote ${relative(root, path)}`);
		return;
	}
	const baseline = readBaseline(path, "disagreements");
	if (!baseline) {
		expect.fail(
			`No baseline for the SQLite fuzzer. Run \`${cmd}\` to create ${relative(root, path)}.`,
		);
		return;
	}
	const { added, fixed } = compareBaseline(r.entries, baseline.entries);
	const failures: string[] = [];
	if (added.length)
		failures.push(
			`${added.length} new disagreement(s) with SQLite:\n${show(added)}`,
		);
	if (fixed.length)
		failures.push(
			`${fixed.length} disagreement(s) in the baseline no longer occur (nice). Run \`${cmd}\` to remove them:\n${show(fixed)}`,
		);
	expect(failures.join("\n\n")).toBe("");
});
