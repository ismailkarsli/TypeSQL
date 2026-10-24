/** Every file is in exactly one shard, and the same files and sizes give the same shards. */
export function shardFiles(
	files: Iterable<[string, number]>,
	{ index, count }: { index: number; count: number },
): string[] {
	const sized = [...files].sort(
		(a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
	);
	const load: number[] = Array(count).fill(0);
	const sets = Array.from({ length: count }, (): string[] => []);
	for (const [f, size] of sized) {
		const k = load.indexOf(Math.min(...load));
		sets[k]!.push(f);
		load[k]! += size;
	}
	return sets[index - 1]!.sort();
}

/** The parts of a Stryker report (mutation-testing-report-schema) a merge touches. */
export interface ShardReport {
	files: Record<string, unknown>;
	testFiles?: Record<string, unknown>;
}

/**
 * A shard's incremental report also carries the results it was given for the other shards'
 * files; those are left out.
 */
export function mergeReports<R extends ShardReport>(
	reports: R[],
	owner: (file: string) => number,
) {
	const files: Record<string, unknown> = {};
	for (const [i, r] of reports.entries())
		for (const [file, f] of Object.entries(r.files))
			if (owner(file) === i) files[file] = f;
	const testFiles: Record<string, unknown> = Object.assign(
		{},
		...reports.map((r) => r.testFiles ?? {}),
	);
	return { ...reports[0]!, files, testFiles };
}
