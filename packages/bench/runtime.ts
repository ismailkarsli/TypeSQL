#!/usr/bin/env node
// Build every statement from case1 with deterministic inputs and reusable setup fragments.
// Imports the built package; run `pnpm --filter @typesql/core build` first.
import { writeFileSync } from "node:fs";
import { fixture, loadWorkload } from "./workload.ts";

const { statements, build } = loadWorkload();
const iterations = 3_000;
let sink: ReturnType<typeof build> = [];
for (let i = 0; i < iterations / 10; i++) sink = build();
const started = performance.now();
for (let i = 0; i < iterations; i++) sink = build();
const totalMs = performance.now() - started;
if (sink.length !== statements || sink.some((q) => !q.text)) {
	throw new Error("case1 did not build every statement");
}
const results = {
	workload: { file: fixture, statements },
	iterations,
	microsecondsPerQuery: Number(
		((totalMs * 1000) / iterations / statements).toFixed(2),
	),
	millisecondsPerWorkload: Number((totalMs / iterations).toFixed(2)),
};
console.log(
	`${fixture}: ${results.microsecondsPerQuery} µs per query, ${results.millisecondsPerWorkload} ms for ${statements} statements`,
);
writeFileSync(
	new URL("./runtime-results.json", import.meta.url),
	`${JSON.stringify(results, null, "\t")}\n`,
);
