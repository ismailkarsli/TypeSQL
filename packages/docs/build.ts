import { execFileSync } from "node:child_process";
import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { DocsVersion } from "./.vitepress/versions.ts";

const root = fileURLToPath(new URL("../../", import.meta.url));
const docs = join(root, "packages/docs");
const dist = join(docs, ".vitepress/dist");
// VitePress caches its Markdown renderer's root, so each snapshot needs a fresh
// process to resolve snippet includes and search entries against its own files.
const buildSite = (source: string) =>
	execFileSync(
		process.execPath,
		[join(docs, "node_modules/vitepress/bin/vitepress.js"), "build", source],
		{ cwd: source, stdio: "inherit" },
	);
const git = (...args: string[]) =>
	execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const filesAt = (ref: string) =>
	git("ls-tree", "-r", "--name-only", ref, "packages").split("\n");
const pages = (files: string[]) => {
	const result = files.flatMap((file) =>
		file.startsWith("packages/docs/") &&
		file.endsWith(".md") &&
		!file.includes("/internals/") &&
		!file.endsWith("/CHANGELOG.md") &&
		!file.includes("[")
			? [file.slice("packages/docs/".length, -3)]
			: [],
	);
	if (files.includes("packages/docs/[page].paths.ts")) result.push("changelog");
	return result;
};

// Tags are sorted newest first, so each major/minor line uses its latest stable
// patch. The core version identifies the documentation release, starting at 3.x.
const tags: { tag: string; version: string; files: string[] }[] = [];
const lines = new Set<string>();
for (const tag of git(
	"tag",
	"--list",
	"@typesql/core@*",
	"--sort=-version:refname",
).split("\n")) {
	const match = /^@typesql\/core@(\d+)\.(\d+)\.\d+$/.exec(tag);
	if (!match || Number(match[1]) < 3) continue;
	const version = `${match[1]}.${match[2]}`;
	if (lines.has(version)) continue;
	const files = filesAt(tag);
	if (!files.includes("packages/docs/.vitepress/config.mts")) continue;
	lines.add(version);
	tags.push({ tag, version, files });
}
const { version }: { version: string } = JSON.parse(
	readFileSync(join(root, "packages/core/package.json"), "utf8"),
);
const currentFiles = git(
	"ls-files",
	"--cached",
	"--others",
	"--exclude-standard",
	"packages/docs",
).split("\n");
const versions: DocsVersion[] = [
	{
		version: version.split(".").slice(0, 2).join("."),
		base: "/",
		pages: pages(currentFiles),
	},
	...tags.map(({ version, files }) => ({
		version,
		base: `/versions/${version}/`,
		pages: pages(files),
	})),
];
process.env.TYPESQL_DOCS_VERSIONS = JSON.stringify(versions);

mkdirSync(join(docs, ".vitepress/cache"), { recursive: true });
const scratch = mkdtempSync(join(docs, ".vitepress/cache/versions-"));
try {
	// Build latest first: VitePress clears its output directory on each build.
	buildSite(docs);
	for (const { tag, version: archiveVersion, files } of tags) {
		const snapshot = join(scratch, archiveVersion);
		mkdirSync(snapshot);
		const archive = execFileSync(
			"git",
			[
				"archive",
				tag,
				"packages/docs",
				"packages/core/package.json",
				...files.filter((file) =>
					/^packages\/[^/]+\/CHANGELOG\.md$/.test(file),
				),
			],
			{ cwd: root, maxBuffer: 64 * 1024 * 1024 },
		);
		execFileSync("tar", ["-x", "-C", snapshot], { input: archive });
		const source = join(snapshot, "packages/docs");
		const config = join(source, ".vitepress/config.mts");
		renameSync(config, join(source, ".vitepress/release.config.mts"));
		writeFileSync(
			config,
			`import config from './release.config.mts';\nimport { withVersions } from ${JSON.stringify(join(docs, ".vitepress/versions.ts"))};\nexport default withVersions(config);\n`,
		);
		process.env.TYPESQL_DOCS_VERSION = archiveVersion;
		console.log(`\nBuilding documentation for ${tag}`);
		cpSync(join(docs, ".vitepress/theme"), join(source, ".vitepress/theme"), {
			recursive: true,
		});
		buildSite(source);
		const output = join(source, ".vitepress/dist");
		// Only the root site's redirects apply to Cloudflare's combined assets.
		if (existsSync(join(output, "_redirects")))
			rmSync(join(output, "_redirects"));
		cpSync(output, join(dist, "versions", archiveVersion), { recursive: true });
	}
} finally {
	delete process.env.TYPESQL_DOCS_VERSION;
	delete process.env.TYPESQL_DOCS_VERSIONS;
	rmSync(scratch, { recursive: true, force: true });
}
