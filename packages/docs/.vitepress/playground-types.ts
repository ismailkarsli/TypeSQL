import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vitepress";

const id = "virtual:typesql-playground-types";
const resolved = `\0${id}`;
const core = fileURLToPath(
	new URL("../node_modules/@typesql/core/", import.meta.url),
);
const wasm = fileURLToPath(
	new URL("../node_modules/@tsrs/wasm/package.json", import.meta.url),
);

interface Manifest {
	name: string;
	version: string;
	type: string;
	types: string;
	exports: Record<string, { types: string }>;
}

function declarations(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) return declarations(path);
		return entry.name.endsWith(".d.ts") ? [path] : [];
	});
}

/**
 * Serves `virtual:typesql-playground-types`: the built `@typesql/core` declarations, keyed by their
 * path in the Playground's in-memory `node_modules`, so the Playground checks against the
 * same version as the documentation it ships with, and the versions it shows.
 */
export function playgroundTypes(): Plugin {
	return {
		name: "typesql-playground-types",
		resolveId(source) {
			return source === id ? resolved : undefined;
		},
		load(source) {
			if (source !== resolved) return undefined;
			const dist = join(core, "dist");
			if (!existsSync(join(dist, "index.d.ts")))
				throw new Error(
					"The Playground needs @typesql/core's declarations: run `pnpm --filter @typesql/core build` first",
				);
			const manifest: Manifest = JSON.parse(
				readFileSync(join(core, "package.json"), "utf8"),
			);
			const files = new Map<string, string>();
			files.set(
				"/node_modules/@typesql/core/package.json",
				JSON.stringify({
					name: manifest.name,
					version: manifest.version,
					type: manifest.type,
					types: manifest.types,
					exports: Object.fromEntries(
						Object.entries(manifest.exports).map(([path, entry]) => [
							path,
							{ types: entry.types },
						]),
					),
				}),
			);
			for (const file of declarations(dist)) {
				this.addWatchFile(file);
				files.set(
					`/node_modules/@typesql/core/${relative(core, file)}`,
					readFileSync(file, "utf8").replace(
						/\n\/\/# sourceMappingURL=\S*\s*$/,
						"\n",
					),
				);
			}
			const compiler: {
				version: string;
				tsrs: { typescriptVersion: string };
			} = JSON.parse(readFileSync(wasm, "utf8"));
			const versions = {
				typesql: manifest.version,
				typescript: compiler.tsrs.typescriptVersion,
				tsrs: compiler.version.replace(/-ts.*$/, ""),
			};
			return `export const versions = ${JSON.stringify(versions)};\nexport const files = ${JSON.stringify(Object.fromEntries(files))};\n`;
		},
	};
}
