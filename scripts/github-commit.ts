import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const [branch, message] = process.argv
	.slice(2)
	.filter((a) => !a.startsWith("--"));
const dryRun = process.argv.includes("--dry-run");
if (!branch || !message) {
	console.error(
		"usage: node scripts/github-commit.ts <branch> <message> [--dry-run]",
	);
	process.exit(2);
}

const git = (...args: string[]) =>
	execFileSync("git", args, { encoding: "utf8" });
const changes = git("diff", "--cached", "--name-status", "--no-renames", "-z")
	.split("\0")
	.filter(Boolean);
const additions: { path: string; contents: string }[] = [];
const deletions: { path: string }[] = [];
for (let i = 0; i < changes.length; i += 2) {
	const [status, path] = [changes[i], changes[i + 1]!];
	if (status === "D") deletions.push({ path });
	else
		additions.push({ path, contents: readFileSync(path).toString("base64") });
}
if (additions.length + deletions.length === 0) {
	console.error("github-commit: nothing staged");
	process.exit(1);
}

const [headline, ...body] = message.split("\n");
const input = {
	branch: {
		repositoryNameWithOwner: process.env.GITHUB_REPOSITORY,
		branchName: branch,
	},
	expectedHeadOid: git("rev-parse", "HEAD").trim(),
	message: { headline, body: body.join("\n").trim() || undefined },
	fileChanges: { additions, deletions },
};
if (dryRun) {
	const summary = {
		...input,
		fileChanges: {
			additions: additions.map((a) => a.path),
			deletions: deletions.map((d) => d.path),
		},
	};
	console.log(JSON.stringify(summary, null, 2));
	process.exit(0);
}

const res = await fetch("https://api.github.com/graphql", {
	method: "POST",
	headers: {
		authorization: `bearer ${process.env.GH_TOKEN}`,
		"content-type": "application/json",
	},
	body: JSON.stringify({
		query:
			"mutation($input: CreateCommitOnBranchInput!) { createCommitOnBranch(input: $input) { commit { oid } } }",
		variables: { input },
	}),
});
const json = (await res.json()) as {
	data?: { createCommitOnBranch?: { commit?: { oid?: string } } };
	errors?: unknown;
};
const oid = json.data?.createCommitOnBranch?.commit?.oid;
if (!res.ok || json.errors || !oid) {
	console.error(
		`github-commit: ${res.status} ${JSON.stringify(json.errors ?? json)}`,
	);
	process.exit(1);
}
console.log(oid);
