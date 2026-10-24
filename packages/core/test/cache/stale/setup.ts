import { resolve } from "node:path";
import { buildCache } from "../generate.js";

/** vitest globalSetup: the cache stale.test-d.ts checks against, generated from schema.ts. */
export default async function setup(): Promise<void> {
	await buildCache(resolve(import.meta.dirname, "tsconfig.gen.json"));
}
