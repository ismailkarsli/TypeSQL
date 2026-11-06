// The packages a release publishes, read from their manifests. Runs without an install.
// usage: node tools/packages.ts <npm|vscode> [name|version|tag|dir ...]
//   prints the given fields (default: tag, i.e. name@version) of each package, one per line

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

interface Manifest {
	name: string;
	version: string;
	private?: boolean;
	files?: string[];
	engines?: { vscode?: string };
	devDependencies?: Record<string, string>;
}

export interface Package {
	name: string;
	version: string;
	/** `name@version`, the package's git tag and npm specifier. */
	tag: string;
	/** Relative to the repository root, like the paths git prints. */
	dir: string;
	/** npm packages are public; a VS Code extension is private to npm and has `engines.vscode`. */
	registry: "npm" | "vscode";
	/** Files and directories, relative to the repository root, that end up in the published package. */
	shipped: string[];
}

const root = fileURLToPath(new URL("..", import.meta.url));

export function releasedPackages(): Package[] {
	const manifests = readdirSync(join(root, "packages")).flatMap((entry) => {
		const dir = `packages/${entry}`;
		const path = join(root, dir, "package.json");
		if (!existsSync(path)) return [];
		const manifest: Manifest = JSON.parse(readFileSync(path, "utf8"));
		return [{ dir, manifest }];
	});
	const dirs = new Map(manifests.map((m) => [m.manifest.name, m.dir]));
	return manifests.flatMap(({ dir, manifest }): Package[] => {
		const { name, version } = manifest;
		const common = { name, version, tag: `${name}@${version}`, dir };
		if (manifest.engines?.vscode)
			return [
				{
					...common,
					registry: "vscode",
					shipped: extensionFiles(dir, manifest, dirs),
				},
			];
		if (manifest.private) return [];
		const shipped = (manifest.files ?? []).map((file) => `${dir}/${file}`);
		return [{ ...common, registry: "npm", shipped }];
	});
}

/**
 * What `vsce package` includes: the `!` entries of .vscodeignore, and what the build bundles
 * into `dist`: `src` and the sources of its workspace dependencies. Those packages' own
 * dependencies don't count: the bundle takes little of core, and every core change would
 * ask for an intent. The release writes CHANGELOG.md, so it is no change of its own.
 */
function extensionFiles(
	dir: string,
	manifest: Manifest,
	dirs: ReadonlyMap<string, string>,
): string[] {
	const ignore = readFileSync(join(root, dir, ".vscodeignore"), "utf8");
	const bundled = Object.entries(manifest.devDependencies ?? {}).flatMap(
		([name, version]) => {
			const source = dirs.get(name);
			return version.startsWith("workspace:") && source
				? [`${source}/src`]
				: [];
		},
	);
	return [
		`${dir}/src`,
		...bundled,
		...ignore
			.split("\n")
			.filter((line) => line.startsWith("!"))
			.map((line) => `${dir}/${line.slice(1).replace(/\/\*\*$/, "")}`)
			.filter((file) => file !== `${dir}/CHANGELOG.md`),
	];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const [registry, ...fields] = process.argv.slice(2);
	const isField = (field: string) =>
		field === "name" ||
		field === "version" ||
		field === "tag" ||
		field === "dir";
	const selected = (fields.length ? fields : ["tag"]).filter(isField);
	if (
		(registry !== "npm" && registry !== "vscode") ||
		selected.length !== Math.max(fields.length, 1)
	) {
		console.error(
			"usage: node tools/packages.ts <npm|vscode> [name|version|tag|dir ...]",
		);
		process.exit(2);
	}
	for (const pkg of releasedPackages())
		if (pkg.registry === registry)
			console.log(selected.map((field) => pkg[field]).join(" "));
}
