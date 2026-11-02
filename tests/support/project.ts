import {
	cp,
	mkdir,
	readdir,
	readFile,
	realpath,
	rm,
	writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { isAbsolute, join, relative } from "node:path";
import { parse, parseAllDocuments, stringify } from "yaml";
import { required } from "./command.ts";
import { type Candidate, digest, repository, workspace } from "./packages.ts";
import type {
	Importer,
	JsonValue,
	LockedPackage,
	Lockfile,
	Snapshot,
} from "./types.ts";

export interface Contract {
	database?: "postgres" | "sqlite";
	failure?: { stage: "generate" | "compile" | "start"; exitCode: number };
	artifacts?: string[];
}
export interface Manifest {
	name: string;
	scripts: Record<string, string>;
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
	consumer?: Contract;
}
const json = async (file: string) => JSON.parse(await readFile(file, "utf8"));
const inside = (parent: string, child: string) =>
	!relative(parent, child).startsWith("..") &&
	!isAbsolute(relative(parent, child));

export async function materialize(
	name: string,
	candidates: Candidate[],
	directory: string,
) {
	const source = join(workspace, "scenarios", name);
	if (inside(repository, directory))
		throw new Error("Consumer must be outside repository");
	await cp(source, directory, {
		recursive: true,
		filter: (path) =>
			!["node_modules", "expected.snap", "dist"].includes(
				path.split("/").at(-1)!,
			),
	});
	const manifest: Manifest = await json(join(directory, "package.json"));
	const lock: Lockfile = parseAllDocuments(
		await readFile(join(workspace, "pnpm-lock.yaml"), "utf8"),
	)
		.at(-1)!
		.toJSON();
	const settings = parse(
		await readFile(join(workspace, "pnpm-workspace.yaml"), "utf8"),
	);
	const importer = structuredClone(lock.importers[`scenarios/${name}`]);
	if (!importer)
		throw new Error(
			`No committed lockfile importer for ${name}; run pnpm --dir tests install`,
		);
	const references: Record<string, string> = {};
	await mkdir(join(directory, ".consumer", "packages"), { recursive: true });
	for (const c of candidates) {
		const filename = c.file.split("/").at(-1)!;
		await cp(c.file, join(directory, ".consumer", "packages", filename));
		references[c.name] = `file:./.consumer/packages/${filename}`;
	}
	for (const section of ["dependencies", "devDependencies"] as const) {
		for (const [dep, version] of Object.entries(manifest[section] ?? {})) {
			if (dep.startsWith("@typesql/")) {
				if (!references[dep])
					throw new Error(`Unknown checkout dependency: ${dep}`);
				manifest[section]![dep] = references[dep]!;
			} else {
				if (version !== "catalog:")
					throw new Error(`External ${dep} must use catalog:`);
				const pinned = settings.catalog[dep];
				if (!pinned || !/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.+-]+)?$/.test(pinned))
					throw new Error(`External ${dep} is not exactly pinned`);
				const resolution = importer[section]?.[dep];
				if (
					!resolution ||
					!(
						resolution.specifier === "catalog:" ||
						(settings.overrides?.[dep] === pinned &&
							resolution.specifier === pinned)
					)
				)
					throw new Error(`Missing catalog resolution for ${dep}`);
				manifest[section]![dep] = pinned;
				resolution.specifier = pinned;
			}
		}
	}
	const lockedGraph = structuredClone(lock);
	prune(lock, importer);
	lock.importers = { ".": importer };
	const overrides = { ...settings.overrides, ...references };
	lock.overrides = overrides;
	delete lock.catalogs;
	delete lock.pnpmfileChecksum;
	await writeFile(
		join(directory, ".consumer", "environment.json"),
		JSON.stringify(
			{
				node: process.version,
				pnpm: "12.11.2",
				bun: "1.4.3",
				postgres: "18.6",
				typescript: settings.catalog.typescript,
				platform: process.platform,
				architecture: process.arch,
				lockfileHash: digest(await readFile(join(workspace, "pnpm-lock.yaml"))),
				buildLockfileHash: digest(
					await readFile(join(repository, "pnpm-lock.yaml")),
				),
				compilerDefaultsHash: digest(
					await readFile(join(workspace, "tsconfig.json")),
				),
				environmentHash: digest(
					await readFile(join(workspace, "environment", "Dockerfile")),
				),
				databaseEnvironmentHash: digest(
					await readFile(join(workspace, "environment", "compose.yaml")),
				),
				artifacts: candidates.map((c) => ({ name: c.name, hash: c.hash })),
			},
			null,
			2,
		),
	);
	await writeFile(
		join(directory, "package.json"),
		JSON.stringify(manifest, null, 2) + "\n",
	);
	// This explicit boundary prevents pnpm from discovering a workspace above /tmp.
	await writeFile(
		join(directory, "pnpm-workspace.yaml"),
		stringify({
			packages: [],
			linkWorkspacePackages: false,
			autoInstallPeers: false,
			hoist: false,
			dedupePeerDependents: false,
			resolvePeersFromWorkspaceRoot: false,
			minimumReleaseAge: 0,
			allowBuilds: settings.allowBuilds,
			overrides,
		}),
	);
	await writeFile(join(directory, "pnpm-lock.yaml"), stringify(lock));
	await cp(join(workspace, "tsconfig.json"), join(directory, "tsconfig.json"));
	// Scenario overrides are ordinary compiler options, never repository aliases.
	try {
		const overrides = await json(join(source, "tsconfig.json"));
		if (
			overrides.extends ||
			overrides.compilerOptions?.paths ||
			overrides.compilerOptions?.baseUrl
		)
			throw new Error("Consumer overrides cannot escape compiler boundary");
		const defaults = await json(join(workspace, "tsconfig.json"));
		await writeFile(
			join(directory, "tsconfig.json"),
			JSON.stringify(
				{
					...defaults,
					...overrides,
					compilerOptions: {
						...defaults.compilerOptions,
						...overrides.compilerOptions,
					},
				},
				null,
				2,
			),
		);
	} catch (error) {
		if (!(error instanceof Error && "code" in error && error.code === "ENOENT"))
			throw error;
	}
	// Offline lock resolution can inspect new tarballs but cannot resolve external ranges online.
	await required(directory, [
		"pnpm",
		"install",
		"--lockfile-only",
		"--offline",
		"--ignore-scripts",
	]);
	const derived: Lockfile = parseAllDocuments(
		await readFile(join(directory, "pnpm-lock.yaml"), "utf8"),
	)
		.at(-1)!
		.toJSON();
	for (const section of ["packages", "snapshots"] as const) {
		for (const [key, value] of Object.entries(derived[section] ?? {})) {
			if (key.startsWith("@typesql/")) {
				if (!key.includes("file:"))
					throw new Error(`Registry TypeSQL resolution: ${key}`);
			} else if (
				stableGraph(value) !== stableGraph(lockedGraph[section]?.[key])
			) {
				throw new Error(
					`External dependency graph changed at ${section}.${key}; update the authoring lockfile deliberately`,
				);
			}
		}
	}
	await required(
		directory,
		["pnpm", "install", "--frozen-lockfile"],
		{},
		300_000,
	);
	const graph = await verify(directory, candidates, derived);
	await writeFile(
		join(directory, ".consumer", "graph.json"),
		JSON.stringify({ candidates: graph, lockfile: derived }, null, 2),
	);
	await cp(
		join(workspace, "support", "observe.mjs"),
		join(directory, ".consumer", "observe.mjs"),
	);
	await cp(
		join(workspace, "support", "runtime.mjs"),
		join(directory, ".consumer", "runtime.mjs"),
	);
	return { directory, manifest };
}
async function verify(
	directory: string,
	candidates: Candidate[],
	lock: Lockfile,
) {
	const graph: { name: string; version: string; hash: string }[] = [];
	const store = join(directory, "node_modules", ".pnpm");
	const verified = new Set<string>();
	for (const entry of await readdir(store)) {
		const scope = join(store, entry, "node_modules", "@typesql");
		let names: string[];
		try {
			names = await readdir(scope);
		} catch {
			continue;
		}
		for (const name of names) {
			const installed = await realpath(join(scope, name));
			if (!inside(store, installed))
				throw new Error(`Workspace/source symlink: ${installed}`);
			if (verified.has(installed)) continue;
			verified.add(installed);
			const c = candidates.find((c) => c.name === `@typesql/${name}`);
			if (!c) throw new Error(`Unexpected TypeSQL package: ${name}`);
			const pkg = await json(join(installed, "package.json"));
			if (pkg.version !== c.manifest.version)
				throw new Error(`Wrong candidate version: ${name}`);
			// Match every installed candidate file against an unpacked copy of its tarball.
			const unpacked = join(directory, ".consumer", "unpacked", name);
			await mkdir(unpacked, { recursive: true });
			await required(directory, [
				"tar",
				"-xzf",
				join(directory, ".consumer", "packages", c.file.split("/").at(-1)!),
				"-C",
				unpacked,
			]);
			async function compare(path: string) {
				for (const e of await readdir(join(unpacked, "package", path), {
					withFileTypes: true,
				})) {
					const next = join(path, e.name);
					if (e.isDirectory()) await compare(next);
					else if (
						digest(await readFile(join(installed, next))) !==
						digest(await readFile(join(unpacked, "package", next)))
					)
						throw new Error(`Installed candidate mismatch: ${name}/${next}`);
				}
			}
			await compare("");
			await rm(unpacked, { recursive: true, force: true });
			const require = createRequire(join(installed, "package.json"));
			for (const dep of Object.keys(pkg.dependencies ?? {})) {
				if (dep.startsWith("@typesql/")) {
					const resolved = await realpath(require.resolve(dep));
					if (!inside(store, resolved))
						throw new Error(`Transitive TypeSQL escaped installation: ${dep}`);
				}
			}
			graph.push({ name: pkg.name, version: pkg.version, hash: c.hash });
		}
	}
	const require = createRequire(join(directory, "package.json"));
	const manifest: Manifest = await json(join(directory, "package.json"));
	for (const name of Object.keys(manifest.dependencies ?? {}).filter((n) =>
		n.startsWith("@typesql/"),
	)) {
		if (
			!graph.some((p) => p.name === name) ||
			!inside(store, await realpath(require.resolve(name)))
		)
			throw new Error(`Missing installed candidate: ${name}`);
	}
	for (const name of ["@biomejs/biome", "tsrs", "@typesql/language-server"]) {
		try {
			require.resolve(name);
		} catch {
			continue;
		}
		throw new Error(`Undeclared repository dependency is accessible: ${name}`);
	}
	for (const [key, value] of Object.entries(lock.packages)) {
		if (
			key.startsWith("@typesql/") &&
			(!value.resolution?.integrity ||
				!value.resolution?.tarball?.startsWith("file:"))
		)
			throw new Error(`Missing candidate tarball integrity: ${key}`);
	}
	return [...new Map(graph.map((p) => [p.name, p])).values()].sort((a, b) =>
		a.name.localeCompare(b.name),
	);
}

// pnpm changes only reachability metadata when a package becomes an optional peer.
function stableGraph(value: LockedPackage | Snapshot | undefined): string {
	if (value === undefined) return "missing";
	const graph = { ...value };
	delete graph.optional;
	const json: JsonValue = JSON.parse(JSON.stringify(graph));
	const sort = (item: JsonValue): JsonValue =>
		Array.isArray(item)
			? item.map(sort)
			: item && typeof item === "object"
				? Object.fromEntries(
						Object.entries(item)
							.sort(([a], [b]) => a.localeCompare(b))
							.map(([k, v]) => [k, sort(v)]),
					)
				: item;
	return JSON.stringify(sort(json));
}

function prune(lock: Lockfile, importer: Importer) {
	const snapshots: Record<string, Snapshot> = {},
		packages: Record<string, LockedPackage> = {};
	const visit = (name: string, reference: string) => {
		const key = `${name}@${reference}`;
		if (key in snapshots) return;
		const snapshot = lock.snapshots[key];
		if (!snapshot)
			throw new Error(`Missing committed external snapshot: ${key}`);
		snapshots[key] = snapshot;
		const packageKey = key.split("(")[0]!;
		const pkg = lock.packages[packageKey];
		if (!pkg)
			throw new Error(`Missing external package integrity: ${packageKey}`);
		packages[packageKey] = pkg;
		for (const section of ["dependencies", "optionalDependencies"] as const) {
			for (const [dep, ref] of Object.entries(snapshot[section] ?? {}))
				visit(dep, ref);
		}
	};
	for (const section of [
		"dependencies",
		"devDependencies",
		"optionalDependencies",
	] as const) {
		for (const [dep, value] of Object.entries(importer[section] ?? {}))
			visit(dep, value.version);
	}
	lock.packages = packages;
	lock.snapshots = snapshots;
}
