import { createRequire } from "node:module";
import { dirname, join, sep } from "node:path";

const ADAPTERS = [
	"@typesql/pg",
	"@typesql/postgres",
	"@typesql/sqlite",
	"@typesql/kysely",
	"@typesql/drizzle",
	"@typesql/prisma",
];

export function corePackage(fileName: string): string | null {
	const req = createRequire(fileName);
	for (const via of [null, ...ADAPTERS]) {
		try {
			const main = (
				via === null ? req : createRequire(req.resolve(via))
			).resolve("@typesql/core");
			return dirname(dirname(main));
		} catch {}
	}
	return null;
}

export const isCorePathIn =
	(dir: string) =>
	(path: string): boolean =>
		path.startsWith(join(dir, "dist") + sep) ||
		path.startsWith(join(dir, "src") + sep);

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
