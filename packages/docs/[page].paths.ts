// Pages generated at build time from files elsewhere in the repository.
// `/changelog` is rendered from the `CHANGELOG.md` files that `pnpm version -r`
// writes (see internals/releasing.md), so it never needs editing by hand. It
// starts at 1.0.0; earlier notes are on the GitHub releases page.
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const releases = "https://github.com/ismailkarsli/TypeSQL/releases";

const packages = [
	{ dir: "core", name: "@typesql/core" },
	{ dir: "pg", name: "@typesql/pg" },
	{ dir: "postgres", name: "@typesql/postgres" },
	{ dir: "sqlite", name: "@typesql/sqlite" },
	{ dir: "kysely", name: "@typesql/kysely" },
	{ dir: "drizzle", name: "@typesql/drizzle" },
	{ dir: "prisma", name: "@typesql/prisma" },
	{ dir: "cli", name: "@typesql/cli" },
	{ dir: "better-auth", name: "@typesql/better-auth" },
	{ dir: "language-server", name: "@typesql/language-server" },
	{ dir: "vscode", name: "typesql", title: "VS Code extension" },
];

type Version = { version: string; body: string };

const major = (version: string): number => Number(version.split(".")[0]);

/** Splits a changelog into its `## <version>` sections. */
function sections(text: string): Version[] {
	return text
		.split(/^## /m)
		.slice(1)
		.map((part) => {
			const newline = part.indexOf("\n");
			return {
				version: part.slice(0, newline).trim(),
				body: part.slice(newline + 1).trim(),
			};
		});
}

/**
 * Escapes `<` outside code, so prose like `db.raw<Schema>(…)` is not read as
 * an HTML tag by the Vue compiler.
 */
function escapeProse(markdown: string): string {
	let fenced = false;
	return markdown
		.split("\n")
		.map((line) => {
			if (/^\s*```/.test(line)) {
				fenced = !fenced;
				return line;
			}
			if (fenced) return line;
			let out = "";
			let i = 0;
			while (i < line.length) {
				if (line[i] === "`") {
					let run = 1;
					while (line[i + run] === "`") run++;
					const fence = "`".repeat(run);
					let end = line.indexOf(fence, i + run);
					while (end >= 0 && line[end + run] === "`")
						end = line.indexOf(fence, end + run + 1);
					if (end >= 0) {
						out += line.slice(i, end + run);
						i = end + run;
						continue;
					}
					out += fence;
					i += run;
					continue;
				}
				out += line[i] === "<" ? "&lt;" : line[i];
				i++;
			}
			return out;
		})
		.join("\n");
}

function changelog(): string {
	const out = [
		"---",
		"outline: 2",
		'description: "Release notes for every TypeSQL package since 1.0.0, newest first, with breaking changes under Major Changes."',
		"editLink: false",
		"---",
		"",
		"# Changelog",
		"",
		`What changed in each release, newest first, generated from each package's \`CHANGELOG.md\`. Breaking changes are listed under **Major Changes**. To move code across them, see [Upgrading](/guide/upgrading). Notes for releases before 1.0.0 are on the [GitHub releases page](${releases}).`,
		"",
		"`@typesql/core`, `@typesql/pg`, `@typesql/postgres`, `@typesql/sqlite`, `@typesql/kysely`, `@typesql/drizzle`, `@typesql/prisma` and `@typesql/cli` are released together at one version since 1.1.0; install them at the same version. The VS Code extension has its own version.",
		"",
	];
	for (const pkg of packages) {
		const file = `${root}packages/${pkg.dir}/CHANGELOG.md`;
		const versions = (
			existsSync(file) ? sections(readFileSync(file, "utf8")) : []
		).filter((v) => major(v.version) >= 1);
		// A package with no 1.x release yet (the language server) has no section.
		if (versions.length === 0) continue;
		const slug = pkg.dir;
		out.push(
			`## ${pkg.title ? `${pkg.title} (\`${pkg.name}\`)` : `\`${pkg.name}\``} {#${slug}}`,
			"",
		);
		for (const { version, body } of versions) {
			out.push(
				`### ${version} {#${slug}-${version.replace(/\W/g, "-")}}`,
				"",
				escapeProse(body.replace(/^(#{3,5}) /gm, "#$1 ")),
				"",
			);
		}
	}
	return out.join("\n");
}

export default {
	watch: ["../*/CHANGELOG.md"],
	paths() {
		return [{ params: { page: "changelog" }, content: changelog() }];
	},
};
