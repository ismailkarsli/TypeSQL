#!/usr/bin/env node
// Checks out the vendor/postgres submodule with only what the regression runs read:
// src/test/regress/{sql,expected,data} (and the top-level files, which hold the version; `data`
// is what the type oracle's replay COPYs). The clone is shallow and fetches file contents only
// for those paths, ~25 MB instead of the whole tree.
//
//   node setup.mjs          check out the commit the repository pins
//   node setup.mjs <ref>    move the submodule to another tag or commit, e.g. REL_18_7, then
//                           run `pnpm test:pg-regress --update` and commit both
//
// A plain `git submodule update --init vendor/postgres` also works; it checks out the whole tree.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const path = "vendor/postgres";
const vendor = join(root, path);
const url = "https://github.com/postgres/postgres.git";
const sparse = ["src/test/regress/sql", "src/test/regress/expected", "src/test/regress/data"];
const ref = process.argv[2];

// `git ls-files -s` prints `160000 <sha> 0\t<path>` for a submodule.
const pinned = git(root, "ls-files", "-s", "--", path).split(/\s+/)[1];
if (!pinned) fail(`${path} is not a submodule of this repository`);

const modules = resolve(root, git(root, "rev-parse", "--git-path", `modules/${path}`));
if (!existsSync(join(vendor, ".git")) && existsSync(modules)) {
  // Checked out before and deinitialized since: reuse that repository and its sparse settings.
  git(root, "submodule", "update", "--init", "--", path);
} else if (!existsSync(join(vendor, ".git"))) {
  git(root, "submodule", "init", "--", path);
  git(root, "init", "-q", path);
  git(vendor, "remote", "add", "origin", url);
  git(vendor, "sparse-checkout", "set", ...sparse);
  git(vendor, "fetch", "-q", "--depth", "1", "--filter=blob:none", "origin", pinned);
  git(vendor, "-c", "advice.detachedHead=false", "checkout", "-q", pinned);
  // Move the repository into .git/modules like `git submodule update` does.
  git(root, "submodule", "absorbgitdirs", "--", path);
} else if (spawnSync("git", ["-C", vendor, "config", "--bool", "core.sparseCheckout"], { encoding: "utf8" }).stdout.trim() !== "true") {
  console.log(`${path} is a full checkout; leaving it as is.`);
} else {
  // A sparse checkout from before a path was added to `sparse`.
  const listed = git(vendor, "sparse-checkout", "list").split("\n");
  if (sparse.some((p) => !listed.includes(p))) git(vendor, "sparse-checkout", "set", ...sparse);
}

const target = ref ?? pinned;
if (git(vendor, "rev-parse", "HEAD") !== target) {
  const dirty = git(vendor, "status", "--porcelain");
  if (dirty) fail(`${path} has local changes. The official tests must never be modified:\n${dirty}`);
  // A tag is fetched as itself so `git describe` and the checkout below can name it.
  const spec = ref && !/^[0-9a-f]{40}$/.test(ref) ? `+refs/tags/${ref}:refs/tags/${ref}` : target;
  git(vendor, "fetch", "-q", "--depth", "1", "--filter=blob:none", "origin", spec);
  git(vendor, "-c", "advice.detachedHead=false", "checkout", "-q", ref ?? target);
}

const head = git(vendor, "rev-parse", "HEAD");
console.log(`${path} at ${head}`);
if (head !== pinned) {
  console.log(`This differs from the pinned commit ${pinned}. Run \`pnpm test:pg-regress --update\`, review the baseline diff, and commit ${path} with it.`);
}

function git(cwd, ...args) {
  const r = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
  if (r.status !== 0) fail(`git ${args.join(" ")} failed:\n${r.stderr}`);
  return r.stdout.trim();
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
