const SKIPS = [
	{
		check: "pg-ast",
		group: "create_view",
		hash: "2a0bfbd87ae6fbc8",
		reason: "overlength-identifiers",
	},
	{
		check: "ddl",
		group: "type_sanity",
		hash: "d607e7bc4ca6db0f",
		reason: "domain-normalization",
	},
] as const;

export function comparisonSkip(
	check: "pg-ast" | "ddl",
	group: string,
	hash: string,
): string | undefined {
	return SKIPS.find(
		(s) => s.check === check && s.group === group && s.hash === hash,
	)?.reason;
}
