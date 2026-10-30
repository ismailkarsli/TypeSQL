import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import lz from "lz-string";
import { checkExamples } from "./check-examples.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(root, "packages/docs/playground");
const check = process.argv.includes("--check");

const sources = new Map(
	readdirSync(sourceDir)
		.filter((f) => f.endsWith(".ts"))
		.map((f) => [basename(f, ".ts"), readFileSync(join(sourceDir, f), "utf8")]),
);

const playgroundUrl = (code: string): string =>
	`https://www.typescriptlang.org/play/?moduleResolution=100#code/${lz.compressToEncodedURIComponent(code)}`;

function markdownFiles(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
		if (e.name === "node_modules" || e.name.startsWith(".")) return [];
		const path = join(dir, e.name);
		return e.isDirectory()
			? markdownFiles(path)
			: e.name.endsWith(".md")
				? [path]
				: [];
	});
}
const docs = [
	join(root, "README.md"),
	...markdownFiles(join(root, "packages")),
].filter((f) => !f.endsWith("CHANGELOG.md"));

const LINK = /https:\/\/www\.typescriptlang\.org\/play\/[^\s)"'<>]*/g;
const MARKER = /data-playground="([\w-]+)"/;
const problems: string[] = [];
const used = new Set<string>();

for (const file of docs) {
	const before = readFileSync(file, "utf8");
	const after = before
		.split("\n")
		.map((line, i, lines) => {
			const name =
				line.match(MARKER)?.[1] ??
				(/^\s*link:/.test(line)
					? lines[i + 1]?.match(/^\s*playground: ([\w-]+)/)?.[1]
					: undefined);
			if (!name) return line;
			const where = `${relative(root, file)}:${i + 1}`;
			const code = sources.get(name);
			if (code === undefined) {
				problems.push(`${where}: no packages/docs/playground/${name}.ts`);
				return line;
			}
			if (line.search(LINK) === -1)
				problems.push(
					`${where}: marker playground:${name} without a Playground link`,
				);
			used.add(name);
			return line.replace(LINK, playgroundUrl(code));
		})
		.join("\n");
	if (after === before) continue;
	if (check)
		problems.push(
			`${relative(root, file)}: stale Playground link (run \`pnpm playground\`)`,
		);
	else {
		writeFileSync(file, after);
		console.log(`updated ${relative(root, file)}`);
	}
}
for (const name of sources.keys()) {
	if (!used.has(name))
		problems.push(
			`packages/docs/playground/${name}.ts: not linked from any Markdown file`,
		);
}

if (check) problems.push(...checkExamples());

if (problems.length) {
	for (const p of problems) console.error(p);
	process.exit(1);
}
if (check)
	console.log(
		`${sources.size} Playground sources compile as marked; links are up to date`,
	);
