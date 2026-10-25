import type { Checker, Type } from "typescript/async";
import { expect, test } from "vitest";
import { schemaOf } from "../../src/complete/schema.js";

test("the schema is read once per checker and DB type", async () => {
	let reads = 0;
	const checker = (): Checker =>
		({
			getPropertiesOfType: async () => {
				reads++;
				return [];
			},
		}) as unknown as Checker;
	const a = checker();
	const db = { id: 1 } as Type;
	const s = schemaOf(a, db);
	expect(schemaOf(a, db)).toBe(s);
	expect(schemaOf(a, { id: 2 } as Type)).not.toBe(s);
	expect(schemaOf(checker(), db)).not.toBe(s);
	expect((await s).namespaces).toEqual([]);
	expect(reads).toBe(3);
});
