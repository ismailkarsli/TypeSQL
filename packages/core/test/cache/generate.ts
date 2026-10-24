/**
 * Generates a type cache for a test project with the real job (src/cache/job.ts) and renders it
 * to `cache.ts`, the augmentation the content mapper would serve, so a plain `tsc` program (and
 * vitest's typecheck) can include it.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { fileId, parseCache, render } from "../../src/cache/format.js";
import { generate, type PassResult } from "../../src/cache/job.js";

const core = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const engine = /export type CacheVersion = "([^"]*)"/.exec(
	readFileSync(join(core, "src/engine/cache.ts"), "utf8"),
)![1]!;
export const isCorePath = (path: string): boolean =>
	path.startsWith(join(core, "src") + sep);

/** Generate `<dir>/.generated/tests.typesqlcache` for `tsconfig` and render it to `<dir>/.generated/cache.ts`. */
export async function buildCache(
	tsconfig: string,
): Promise<PassResult & { cacheFile: string; rendered: string }> {
	const out = join(dirname(tsconfig), ".generated");
	mkdirSync(out, { recursive: true });
	const cacheFile = join(out, "tests.typesqlcache");
	writeFileSync(cacheFile, "{}\n");
	writeFileSync(join(out, "cache.ts"), "export {};\n");
	const log = process.env.TYPESQL_CACHE_TEST_LOG
		? { log: (m: string) => console.error(m) }
		: {};
	const result = await generate({
		configFile: tsconfig,
		cacheFile,
		engine,
		isCorePath,
		...log,
	});
	const rendered = join(out, "cache.ts");
	writeFileSync(
		rendered,
		render(
			parseCache(readFileSync(cacheFile, "utf8")),
			fileId(cacheFile),
			engine,
		),
	);
	return { ...result, cacheFile, rendered };
}
