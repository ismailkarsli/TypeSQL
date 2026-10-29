import { join, relative } from "node:path";
import { expect, test } from "vitest";
import {
	compareBaseline,
	readBaseline,
	showEntries,
	writeBaseline,
} from "../oracle/baseline.js";
import { runOracle } from "./oracle.js";

const update = process.env["TYPESQL_ORACLE_UPDATE"] === "1";
const root = join(import.meta.dirname, "../../../..");
const path = join(import.meta.dirname, "baseline.json");

test("the SQLite query corpus against SQLite", async () => {
	const { DatabaseSync } = await import("node:sqlite");
	const version = (
		new DatabaseSync(":memory:")
			.prepare("SELECT sqlite_version() AS v")
			.get() as { v: string }
	).v;
	const r = await runOracle((m) => console.log(m));
	const tally = Object.entries(r.tally)
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([k, n]) => `${k}: ${n}`)
		.join(", ");
	console.log(`sqlite oracle on SQLite ${version}: ${tally}`);
	const cmd = "pnpm test:sqlite --update";
	if (update) {
		writeBaseline(path, { sqlite: version }, "disagreements", r.entries);
		console.log(`Wrote ${relative(root, path)}`);
		return;
	}
	const baseline = readBaseline(path, "disagreements");
	if (!baseline) {
		expect.fail(
			`No baseline for the SQLite oracle. Run \`${cmd}\` to create ${relative(root, path)}.`,
		);
		return;
	}
	const { added, fixed } = compareBaseline(r.entries, baseline.entries);
	const show = (list: Parameters<typeof showEntries>[0]) =>
		showEntries(
			list,
			(e) =>
				`  ${e.group}  [${e.kind}]  ${String(e.sql)}\n      ${String(e.detail)}`,
		);
	const failures: string[] = [];
	if (
		String(baseline.pins.sqlite).split(".").slice(0, 2).join(".") !==
		version.split(".").slice(0, 2).join(".")
	)
		failures.push(
			`${relative(root, path)} is for SQLite ${String(baseline.pins.sqlite)}, Node ships ${version}. Run \`${cmd}\` and review the diff.`,
		);
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
