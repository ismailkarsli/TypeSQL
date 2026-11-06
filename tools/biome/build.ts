// Writes the Biome GritQL plugins tools/biome/*.grit from their sources in src/.
// usage: node tools/biome/build.ts [--check]
//
// Biome's GritQL has no imports and no bounded recursion, so a source may use:
//   #include <name>      the definition in shared/<name>.grit
//   #repeat <a>..<b>     the following lines up to #end once for each n from a to b,
//   ...                  with {{n}}, {{n+1}}, {{n-1}}, ... replaced by n and its neighbours
//   #end
// --check fails when a plugin differs from its source or biome.json does not load it.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const here = import.meta.dirname;
const check = process.argv.includes("--check");

function expand(source: string): string {
	return source
		.replace(
			/^#repeat (\d+)\.\.(\d+)\n([\s\S]*?)^#end\n/gm,
			(_, from: string, to: string, body: string) => {
				const copies: string[] = [];
				for (let n = Number(from); n <= Number(to); n++)
					copies.push(
						body.replace(/\{\{n(?:([+-])(\d+))?\}\}/g, (_, sign, offset) =>
							String(
								sign === "-" ? n - Number(offset) : n + Number(offset ?? 0),
							),
						),
					);
				return copies.join("\n");
			},
		)
		.replace(/^#include (\S+)\n/gm, (_, name: string) =>
			readFileSync(join(here, "shared", `${name}.grit`), "utf8"),
		);
}

const plugins = readdirSync(join(here, "src")).filter((f) =>
	f.endsWith(".grit"),
);
let stale = false;
for (const file of plugins) {
	const output = join(here, file);
	const plugin = expand(readFileSync(join(here, "src", file), "utf8"));
	if (!check) writeFileSync(output, plugin);
	else if (readFileSync(output, "utf8") !== plugin) {
		console.error(`tools/biome/${file} differs from src/${file}`);
		stale = true;
	}
}

const biome: { plugins: string[] } = JSON.parse(
	readFileSync(join(here, "../../biome.json"), "utf8"),
);
const loaded = new Set(biome.plugins);
for (const file of plugins)
	if (!loaded.has(`./tools/biome/${file}`)) {
		console.error(`biome.json does not load ./tools/biome/${file}`);
		stale = true;
	}
if (stale) {
	console.error(
		"run node tools/biome/build.ts and add new plugins to biome.json",
	);
	process.exitCode = 1;
}
