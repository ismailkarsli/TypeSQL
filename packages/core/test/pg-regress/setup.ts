#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const path = "vendor/postgres";
const vendor = join(root, path);
const url = "https://github.com/postgres/postgres.git";
const sparse = [
	"src/test/regress/sql",
	"src/test/regress/expected",
	"src/test/regress/data",
];
const ref = process.argv[2];

const pinned = git(root, "ls-files", "-s", "--", path).split(/\s+/)[1];
if (!pinned) fail(`${path} is not a submodule of this repository`);

const modules = resolve(
	root,
	git(root, "rev-parse", "--git-path", `modules/${path}`),
);
if (!existsSync(join(vendor, ".git")) && existsSync(modules)) {
	git(root, "submodule", "update", "--init", "--", path);
} else if (!existsSync(join(vendor, ".git"))) {
	git(root, "submodule", "init", "--", path);
	git(root, "init", "-q", path);
	git(vendor, "remote", "add", "origin", url);
	git(vendor, "sparse-checkout", "set", ...sparse);
	git(
		vendor,
		"fetch",
		"-q",
		"--depth",
		"1",
		"--filter=blob:none",
		"origin",
		pinned,
	);
	git(vendor, "-c", "advice.detachedHead=false", "checkout", "-q", pinned);
	git(root, "submodule", "absorbgitdirs", "--", path);
} else if (
	spawnSync("git", ["-C", vendor, "config", "--bool", "core.sparseCheckout"], {
		encoding: "utf8",
	}).stdout.trim() !== "true"
) {
	console.log(`${path} is a full checkout; leaving it as is.`);
} else {
	const listed = git(vendor, "sparse-checkout", "list").split("\n");
	if (sparse.some((p) => !listed.includes(p)))
		git(vendor, "sparse-checkout", "set", ...sparse);
}

const target = ref ?? pinned;
if (git(vendor, "rev-parse", "HEAD") !== target) {
	const dirty = git(vendor, "status", "--porcelain");
	if (dirty)
		fail(
			`${path} has local changes. The official tests must never be modified:\n${dirty}`,
		);
	const spec =
		ref && !/^[0-9a-f]{40}$/.test(ref)
			? `+refs/tags/${ref}:refs/tags/${ref}`
			: target;
	git(
		vendor,
		"fetch",
		"-q",
		"--depth",
		"1",
		"--filter=blob:none",
		"origin",
		spec,
	);
	git(
		vendor,
		"-c",
		"advice.detachedHead=false",
		"checkout",
		"-q",
		ref ?? target,
	);
}

const head = git(vendor, "rev-parse", "HEAD");
console.log(`${path} at ${head}`);
if (head !== pinned) {
	console.log(
		`This differs from the pinned commit ${pinned}. Run \`pnpm test:pg-regress --update\`, review the baseline diff, and commit ${path} with it.`,
	);
}

function git(cwd: string, ...args: string[]): string {
	const r = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
	if (r.status !== 0) fail(`git ${args.join(" ")} failed:\n${r.stderr}`);
	return r.stdout.trim();
}

function fail(message: string): never {
	console.error(message);
	process.exit(1);
}
