import { expect, test } from "vitest";
import { comparisonSkip } from "./comparison-skips.js";

test.each([
	["pg-ast", "create_view", "2a0bfbd87ae6fbc8", "overlength-identifiers"],
	["ddl", "type_sanity", "d607e7bc4ca6db0f", "domain-normalization"],
] as const)(
	"%s excludes only the reviewed %s statement",
	(check, group, hash, reason) => {
		expect(comparisonSkip(check, group, hash)).toBe(reason);
		expect(comparisonSkip(check, group, "different statement")).toBeUndefined();
		expect(comparisonSkip(check, "different group", hash)).toBeUndefined();
		expect(
			comparisonSkip(check === "ddl" ? "pg-ast" : "ddl", group, hash),
		).toBeUndefined();
	},
);
