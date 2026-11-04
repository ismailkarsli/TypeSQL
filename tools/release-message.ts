import { readFileSync } from "node:fs";

// Builds the release commit message from the released `name@version` lines on stdin.
// The subject names one package per version, preferring @typesql/core; the body lists all.
// usage: node tools/release-message.ts [--extension <version>] < released.txt

const args = process.argv.slice(2);
const extensionIndex = args.indexOf("--extension");
const extension = extensionIndex === -1 ? undefined : args[extensionIndex + 1];

const released = readFileSync(0, "utf8")
	.split("\n")
	.map((line) => line.trim())
	.filter(Boolean)
	.map((line) => {
		const at = line.lastIndexOf("@");
		return { name: line.slice(0, at), version: line.slice(at + 1) };
	})
	.sort((a, b) => a.name.localeCompare(b.name));

const byVersion = new Map<string, string[]>();
for (const { name, version } of released) {
	byVersion.set(version, [...(byVersion.get(version) ?? []), name]);
}

const groups = [...byVersion].map(([version, names]) => {
	const lead = names.includes("@typesql/core") ? "@typesql/core" : names[0];
	const more = names.length - 1;
	return {
		core: lead === "@typesql/core",
		text: `${lead} ${version}${more ? ` (+${more} ${more === 1 ? "package" : "packages"})` : ""}`,
	};
});
groups.sort((a, b) => Number(b.core) - Number(a.core));

const subject = groups.map((group) => group.text);
const body = released.map(({ name, version }) => `- ${name} ${version}`);
if (extension) {
	subject.push(`VS Code extension ${extension}`);
	body.push(`- VS Code extension (typesql) ${extension}`);
}

if (subject.length === 0) {
	console.log("chore: update release metadata");
} else {
	console.log(`chore: release ${subject.join(", ")}\n\n${body.join("\n")}`);
}
