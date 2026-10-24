// Fails when a published package's shipped files changed since <base> but no change intent
// (`.changeset/*.md`, written by `pnpm change`) added in the same range names the package.
// A `--bump none` intent counts: it records that the change needs no release.
//
//   node scripts/check-intents.ts [base]   # base defaults to origin/main
//
// "Shipped files" are the package's `files` entries plus package.json; a package.json change
// that only touches "version" (a `pnpm version -r` release commit) does not count.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const git = (...args: string[]): string =>
	execFileSync("git", args, { encoding: "utf8" });
const tryGit = (...args: string[]): string | undefined => {
	try {
		return git(...args);
	} catch {
		return undefined;
	}
};

const arg = process.argv[2] || "origin/main";
if (
	/^0+$/.test(arg) ||
	tryGit("rev-parse", "--verify", "--quiet", `${arg}^{commit}`) === undefined
) {
	console.log(
		`check-intents: base ${arg} is not a known commit (new branch or force push); skipping.`,
	);
	process.exit(0);
}
const base = git("merge-base", arg, "HEAD").trim();

interface Manifest {
	name: string;
	private?: boolean;
	files?: string[];
}
interface Package {
	dir: string;
	manifestPath: string;
	manifest: Manifest;
}

const packages: Package[] = readdirSync("packages")
	.map((dir) => ({
		dir: `packages/${dir}`,
		manifestPath: join("packages", dir, "package.json"),
	}))
	.filter((p) => existsSync(p.manifestPath))
	.map((p) => ({
		...p,
		manifest: JSON.parse(readFileSync(p.manifestPath, "utf8")) as Manifest,
	}))
	.filter((p) => !p.manifest.private);

const changed = new Set(
	[
		git("diff", "--name-only", base),
		git("ls-files", "--others", "--exclude-standard"),
	]
		.join("\n")
		.split("\n")
		.filter(Boolean),
);

const withoutVersion = (text: string): string => {
	const { version, ...rest } = JSON.parse(text);
	return JSON.stringify(rest);
};

function shippedChange(pkg: Package): string | undefined {
	for (const file of changed) {
		if (!file.startsWith(`${pkg.dir}/`)) continue;
		const rel = file.slice(pkg.dir.length + 1);
		if (rel === "package.json") {
			const before = tryGit("show", `${base}:${file}`);
			const after = existsSync(file) ? readFileSync(file, "utf8") : undefined;
			if (
				before === undefined ||
				after === undefined ||
				withoutVersion(before) !== withoutVersion(after)
			)
				return file;
		} else if (
			(pkg.manifest.files ?? []).some(
				(entry) => rel === entry || rel.startsWith(`${entry}/`),
			)
		) {
			return file;
		}
	}
}

// Front matter keys of an intent: package names, or `./dir` for ambiguous names.
function intentTargets(text: string): string[] {
	const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
	if (!match) return [];
	return match[1]!
		.split(/\r?\n/)
		.map((line) => /^\s*["']?([^"':]+?)["']?\s*:/.exec(line)?.[1])
		.filter((key): key is string => Boolean(key))
		.map((key) => key.replace(/^\.\//, "").replace(/\/$/, ""));
}

const isIntent = (file: string): boolean =>
	/^\.changeset\/[^/]+\.md$/.test(file) && file !== ".changeset/README.md";

// Intents added in the range, including ones a release commit in the range has since consumed
// and deleted (read from the commit that added them), plus uncommitted ones.
const intentTexts: string[] = [];
let commit: string | undefined;
for (const line of git(
	"log",
	"--format=%x00%H",
	"--name-only",
	"--diff-filter=AM",
	`${base}..HEAD`,
	"--",
	".changeset",
).split("\n")) {
	if (line.startsWith("\0")) commit = line.slice(1);
	else if (isIntent(line)) intentTexts.push(git("show", `${commit}:${line}`));
}
for (const file of changed) {
	if (isIntent(file) && existsSync(file))
		intentTexts.push(readFileSync(file, "utf8"));
}
const covered = new Set(intentTexts.flatMap(intentTargets));

const missing = packages
	.map((pkg) => ({ pkg, file: shippedChange(pkg) }))
	.filter(
		({ pkg, file }) =>
			file && !covered.has(pkg.manifest.name) && !covered.has(pkg.dir),
	);

if (missing.length === 0) {
	console.log(`check-intents: ok (since ${base.slice(0, 7)})`);
	process.exit(0);
}

console.error(
	`check-intents: published packages changed since ${base.slice(0, 7)} without a change intent:\n`,
);
for (const { pkg, file } of missing)
	console.error(`  ${pkg.manifest.name}  (${file})`);
const names = missing.map(({ pkg }) => pkg.manifest.name).join(" ");
console.error(`
Record one and commit it with the change:

  pnpm change ${names} --bump patch --summary "…"
  pnpm change ${names} --bump none --summary "…"   # if the change needs no release

See packages/docs/internals/releasing.md.`);
process.exit(1);
