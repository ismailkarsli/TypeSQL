/**
 * Finds the `@typesql/core` a file's project uses: resolved from the file, or through an adapter
 * (`@typesql/pg`, …) when core is only its dependency. Completions recognize `sql()` calls by
 * their callee's declaration in that package.
 */
import { createRequire } from "node:module";
import { dirname, join, sep } from "node:path";

const ADAPTERS = [
	"@typesql/pg",
	"@typesql/postgres",
	"@typesql/kysely",
	"@typesql/drizzle",
	"@typesql/prisma",
];

/** The directory of the `@typesql/core` package `fileName` uses, or null. */
export function corePackage(fileName: string): string | null {
	const req = createRequire(fileName);
	for (const via of [null, ...ADAPTERS]) {
		try {
			// every version's main module is dist/index.js
			const main = (
				via === null ? req : createRequire(req.resolve(via))
			).resolve("@typesql/core");
			return dirname(dirname(main));
		} catch {
			// not installed
		}
	}
	return null;
}

/** Whether a declaration is in `dir`'s `dist` or `src`. */
export const isCorePathIn =
	(dir: string) =>
	(path: string): boolean =>
		path.startsWith(join(dir, "dist") + sep) ||
		path.startsWith(join(dir, "src") + sep);

/** `isCorePath` for each file's project, looked up once per directory. */
export class CorePaths {
	private readonly byDir = new Map<
		string,
		((path: string) => boolean) | null
	>();
	private readonly logged = new Set<string>();
	private readonly log: (message: string) => void;

	constructor(log: (message: string) => void) {
		this.log = log;
	}

	/** `isCorePath` for `fileName`'s project, or null (logged) without `@typesql/core`. */
	for(fileName: string): ((path: string) => boolean) | null {
		const dir = dirname(fileName);
		let found = this.byDir.get(dir);
		if (found === undefined) {
			const core = corePackage(fileName);
			if (core === null) this.log(`no @typesql/core found from ${dir}`);
			else if (!this.logged.has(core)) {
				this.logged.add(core);
				this.log(`using @typesql/core at ${core}`);
			}
			found = core === null ? null : isCorePathIn(core);
			this.byDir.set(dir, found);
		}
		return found;
	}
}
