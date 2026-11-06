import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { type Package, releasedPackages } from "./packages.ts";

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

const packages = releasedPackages();

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
		if (file === `${pkg.dir}/package.json`) {
			const before = tryGit("show", `${base}:${file}`);
			const after = existsSync(file) ? readFileSync(file, "utf8") : undefined;
			if (
				before === undefined ||
				after === undefined ||
				withoutVersion(before) !== withoutVersion(after)
			)
				return file;
		} else if (
			pkg.shipped.some(
				(entry) => file === entry || file.startsWith(`${entry}/`),
			)
		) {
			return file;
		}
	}
}

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

const missing = packages.flatMap((pkg) => {
	const file = shippedChange(pkg);
	return file && !covered.has(pkg.name) && !covered.has(pkg.dir)
		? [{ pkg, file }]
		: [];
});

if (missing.length === 0) {
	console.log(`check-intents: ok (since ${base.slice(0, 7)})`);
	process.exit(0);
}

console.error(
	`check-intents: released packages changed since ${base.slice(0, 7)} without a change intent:\n`,
);
for (const { pkg, file } of missing) console.error(`  ${pkg.name}  (${file})`);
const names = missing.map(({ pkg }) => pkg.name).join(" ");
console.error(`
Record one and commit it with the change:

  pnpm change ${names} --bump patch --summary "…"
  pnpm change ${names} --bump none --summary "…"   # if the change needs no release

See packages/docs/internals/releasing.md.`);
process.exit(1);
