import { resolve } from "node:path";
import { buildCache } from "../generate.js";

/** vitest globalSetup: the cache the type tests run against, generated from those tests. */
export default async function setup(): Promise<void> {
	const r = await buildCache(resolve(import.meta.dirname, "tsconfig.gen.json"));
	console.log(
		`type cache for the type tests: ${r.statements} statements, ${r.computed} entries, ${r.dropped} dropped, ${(r.ms / 1000).toFixed(1)} s`,
	);
}
