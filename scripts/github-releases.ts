import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const dryRun = process.argv.includes("--dry-run");
const summaryIndex = process.argv.indexOf("--summary");
const justPublished = new Set(
	summaryIndex === -1
		? []
		: (
				JSON.parse(
					readFileSync(process.argv[summaryIndex + 1]!, "utf8"),
				) as PublishSummary
			).publishedPackages.map((p) => `${p.name}@${p.version}`),
);
const LATEST = "@typesql/core";

interface PublishSummary {
	publishedPackages: { name: string; version: string }[];
}

interface Section {
	path: string;
	name: string;
	version: string;
	commit: string;
	time: number;
}

const run = (cmd: string, args: string[]) =>
	execFileSync(cmd, args, {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
const git = (...args: string[]) => run("git", args);
const succeeds = (cmd: string, args: string[]) => {
	try {
		run(cmd, args);
		return true;
	} catch {
		return false;
	}
};

const sections = new Map<string, Section>();
let commit: string | undefined, time: string | undefined;
for (const line of git(
	"log",
	"--reverse",
	"--format=%x00%H %ct",
	"--name-only",
	"--diff-filter=A",
	"--",
	".changeset/changelogs",
).split("\n")) {
	if (line.startsWith("\0")) {
		[commit, time] = line.slice(1).split(" ");
		continue;
	}
	const match = /^\.changeset\/changelogs\/(.+)!(.+)@([^@]+)\.md$/.exec(line);
	if (match && !sections.has(line)) {
		sections.set(line, {
			path: line,
			name: `${match[1]}/${match[2]}`,
			version: match[3]!,
			commit: commit!,
			time: Number(time),
		});
	}
}

const packuments = new Map<string, { versions: Record<string, unknown> }>();
async function published(name: string, version: string): Promise<boolean> {
	if (justPublished.has(`${name}@${version}`)) return true;
	if (!packuments.has(name)) {
		const res = await fetch(
			`https://registry.npmjs.org/${name.replace("/", "%2f")}`,
		);
		packuments.set(
			name,
			res.ok
				? ((await res.json()) as { versions: Record<string, unknown> })
				: { versions: {} },
		);
	}
	return version in packuments.get(name)!.versions;
}

async function create(tag: string, args: string[]): Promise<string> {
	for (let attempt = 1; ; attempt++) {
		try {
			return run("gh", args).trim();
		} catch (error) {
			const e = error as Error & { stderr: string };
			if (succeeds("gh", ["release", "view", tag]))
				return `${tag}: created (GitHub answered ${String(e.stderr).trim()})`;
			if (attempt === 3 || !/HTTP 5\d\d/.test(String(e.stderr))) throw e;
			console.log(`${tag}: ${String(e.stderr).trim()}, retrying`);
			await new Promise((r) => setTimeout(r, attempt * 5000));
		}
	}
}

const isPushed = (commit: string) =>
	git("branch", "-r", "--contains", commit).trim() !== "";
const newestCore = (releases: Release[]) =>
	releases.filter((r) => r.name === LATEST && !r.version.includes("-")).at(-1);

type Release = Section & { tag: string };
const pending: Release[] = [];
for (const section of sections.values()) {
	const tag = `${section.name}@${section.version}`;
	if (summaryIndex !== -1 && !justPublished.has(tag)) continue;
	if (succeeds("gh", ["release", "view", tag])) continue;
	if (!(await published(section.name, section.version))) {
		console.log(`skip ${tag}: not on npm yet`);
		continue;
	}
	if (!isPushed(section.commit)) {
		console.log(
			`skip ${tag}: release commit ${section.commit.slice(0, 7)} is not pushed`,
		);
		continue;
	}
	pending.push({ ...section, tag });
}

pending.sort(
	(a, b) =>
		a.time - b.time || Number(a.name === LATEST) - Number(b.name === LATEST),
);
const latest = newestCore(pending);

for (const release of pending) {
	const lastCommit = git(
		"log",
		"-1",
		"--format=%H",
		"--diff-filter=AM",
		"--",
		release.path,
	).trim();
	const section = git("show", `${lastCommit}:${release.path}`)
		.replace(/^## .*\r?\n+/, "")
		.trim();
	const notes = `${section}\n\nnpm: https://www.npmjs.com/package/${release.name}/v/${release.version}\n`;
	const args = [
		"release",
		"create",
		release.tag,
		"--target",
		release.commit,
		"--title",
		release.tag,
		"--notes",
		notes,
	];
	if (release.version.includes("-")) args.push("--prerelease");
	args.push(`--latest=${release === latest}`);

	if (dryRun) {
		console.log(
			`would create ${release.tag} at ${release.commit.slice(0, 7)}${release === latest ? " (latest)" : ""}\n${notes}`,
		);
	} else {
		console.log(await create(release.tag, args));
	}
}

if (pending.length === 0) console.log("github-releases: nothing to create");
