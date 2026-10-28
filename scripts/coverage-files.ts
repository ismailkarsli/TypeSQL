import { globSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const root = fileURLToPath(new URL("..", import.meta.url));

export const coverageInclude = [
	"packages/{core,pg,postgres,kysely,drizzle,prisma,vscode,language-server}/src/**/*.{ts,mts}",
];

// core's engine, schema and type-map are type-level only: no runtime code to cover.
export const coverageExclude = [
	"packages/core/src/{engine,schema,type-map}/**",
	"**/*.d.ts",
];

export function coverageFiles() {
	return globSync(coverageInclude, { cwd: root, exclude: coverageExclude })
		.map((f) => f.replaceAll("\\", "/"))
		.sort();
}
