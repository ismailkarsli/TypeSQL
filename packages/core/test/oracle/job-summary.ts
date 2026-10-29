import { appendFileSync } from "node:fs";
import type { Located } from "./baseline.ts";

export function counts(
	tally: { readonly [outcome: string]: number },
	first: readonly string[] = ["agree"],
): string {
	let skipped = 0;
	const rest: [string, number][] = [];
	for (const [k, n] of Object.entries(tally))
		if (k.startsWith("skip: ")) skipped += n;
		else rest.push([k, n]);
	const rank = (k: string) => (first.indexOf(k) + 1 || first.length + 1) - 1;
	return [
		...rest
			.sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
			.map(([k, n]) => `${k} ${n}`),
		...(skipped ? [`skipped ${skipped}`] : []),
	].join(" · ");
}

export function groups(list: readonly Located[], limit = 20): string {
	const n = new Map<string, number>();
	for (const e of list) n.set(e.group, (n.get(e.group) ?? 0) + 1);
	const sorted = [...n].sort(([a, x], [b, y]) => y - x || a.localeCompare(b));
	return [
		...sorted.slice(0, limit).map(([g, k]) => `\`${g}\` (${k})`),
		...(sorted.length > limit ? [`${sorted.length - limit} more`] : []),
	].join(", ");
}

export function baselineProblems(
	added: readonly Located[],
	fixed: readonly Located[],
	cmd: string,
	what = "disagreement(s)",
): string[] {
	return [
		...(added.length ? [`${added.length} new ${what}: ${groups(added)}`] : []),
		...(fixed.length
			? [
					`${fixed.length} ${what} in the baseline no longer occur (\`${cmd}\`): ${groups(fixed)}`,
				]
			: []),
	];
}

export function jobSummary(
	title: string,
	line: string,
	problems: readonly string[] = [],
): void {
	const path = process.env["GITHUB_STEP_SUMMARY"];
	if (!path) return;
	appendFileSync(
		path,
		`### ${problems.length ? "❌" : "✅"} ${title}\n\n${line}\n${problems.map((p) => `\n- ${p}`).join("")}${problems.length ? "\n" : ""}\n`,
	);
}
