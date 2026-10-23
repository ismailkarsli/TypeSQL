// Creates a GitHub release (and its tag, `<name>@<version>`) for every package version that is
// published on npm and has no release yet. The notes are the changelog section `pnpm version -r`
// wrote to `.changeset/changelogs/<scope>!<name>@<version>.md`, read from git history, so
// versions whose section a later `pnpm version -r` has already pruned still get one. The tag
// points at the release commit that added the section, which must be pushed. Idempotent: run
// it after every `pnpm publish -r`; a rerun only creates what is missing.
//
//   node scripts/github-releases.mjs [--dry-run] [--summary pnpm-publish-summary.json]
//
// With --summary (the release workflow), only the versions listed in that
// `pnpm publish -r --report-summary` file are released, without asking the registry, which can
// report the previous versions for a few minutes after a publish. Older versions are left
// alone: the workflow's GITHUB_TOKEN was refused (HTTP 403) tags on old release commits,
// whose workflow files differ from main's. Without --summary it backfills every published version that has no release,
// which needs a `gh` login allowed to do that (a maintainer's).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const dryRun = process.argv.includes("--dry-run");
const summaryIndex = process.argv.indexOf("--summary");
const justPublished = new Set(
  summaryIndex === -1
    ? []
    : JSON.parse(readFileSync(process.argv[summaryIndex + 1], "utf8")).publishedPackages.map((p) => `${p.name}@${p.version}`),
);
const LATEST = "@typesql/core";

const run = (cmd, args) => execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const git = (...args) => run("git", args);
const succeeds = (cmd, args) => {
  try {
    run(cmd, args);
    return true;
  } catch {
    return false;
  }
};

// Every section file ever added, oldest release first.
const sections = new Map();
let commit, time;
for (const line of git("log", "--reverse", "--format=%x00%H %ct", "--name-only", "--diff-filter=A", "--", ".changeset/changelogs").split("\n")) {
  if (line.startsWith("\0")) {
    [commit, time] = line.slice(1).split(" ");
    continue;
  }
  const match = /^\.changeset\/changelogs\/(.+)!(.+)@([^@]+)\.md$/.exec(line);
  if (match && !sections.has(line)) {
    sections.set(line, { path: line, name: `${match[1]}/${match[2]}`, version: match[3], commit, time: Number(time) });
  }
}

const packuments = new Map();
async function published(name, version) {
  if (justPublished.has(`${name}@${version}`)) return true;
  if (!packuments.has(name)) {
    const res = await fetch(`https://registry.npmjs.org/${name.replace("/", "%2f")}`);
    packuments.set(name, res.ok ? await res.json() : { versions: {} });
  }
  return version in packuments.get(name).versions;
}

/**
 * `gh release create`, retried on a GitHub server error. GitHub can answer 5xx and still create
 * the release, so after an error the release counts as created if it exists.
 */
async function create(tag, args) {
  for (let attempt = 1; ; attempt++) {
    try {
      return run("gh", args).trim();
    } catch (e) {
      if (succeeds("gh", ["release", "view", tag])) return `${tag}: created (GitHub answered ${String(e.stderr).trim()})`;
      if (attempt === 3 || !/HTTP 5\d\d/.test(String(e.stderr))) throw e;
      console.log(`${tag}: ${String(e.stderr).trim()}, retrying`);
      await new Promise((r) => setTimeout(r, attempt * 5000));
    }
  }
}

const isPushed = (commit) => git("branch", "-r", "--contains", commit).trim() !== "";
const newestCore = (releases) =>
  releases.filter((r) => r.name === LATEST && !r.version.includes("-")).at(-1);

const pending = [];
for (const section of sections.values()) {
  const tag = `${section.name}@${section.version}`;
  if (summaryIndex !== -1 && !justPublished.has(tag)) continue;
  if (succeeds("gh", ["release", "view", tag])) continue;
  if (!(await published(section.name, section.version))) {
    console.log(`skip ${tag}: not on npm yet`);
    continue;
  }
  if (!isPushed(section.commit)) {
    console.log(`skip ${tag}: release commit ${section.commit.slice(0, 7)} is not pushed`);
    continue;
  }
  pending.push({ ...section, tag });
}

// Oldest first so the Releases tab lists them in order; core last within a release commit so
// it is the one marked "Latest".
pending.sort((a, b) => a.time - b.time || (a.name === LATEST) - (b.name === LATEST));
const latest = newestCore(pending);

for (const release of pending) {
  // The section repeats the version as its first heading; the release title already has it.
  const lastCommit = git("log", "-1", "--format=%H", "--diff-filter=AM", "--", release.path).trim();
  const section = git("show", `${lastCommit}:${release.path}`).replace(/^## .*\r?\n+/, "").trim();
  const notes = `${section}\n\nnpm: https://www.npmjs.com/package/${release.name}/v/${release.version}\n`;
  const args = ["release", "create", release.tag, "--target", release.commit, "--title", release.tag, "--notes", notes];
  if (release.version.includes("-")) args.push("--prerelease");
  args.push(`--latest=${release === latest}`);

  if (dryRun) {
    console.log(`would create ${release.tag} at ${release.commit.slice(0, 7)}${release === latest ? " (latest)" : ""}\n${notes}`);
  } else {
    console.log(await create(release.tag, args));
  }
}

if (pending.length === 0) console.log("github-releases: nothing to create");
