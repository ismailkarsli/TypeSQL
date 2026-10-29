import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const docs = join(root, "packages/docs");
const expectations: Record<string, string[]> = JSON.parse(
	readFileSync(join(docs, "expected-errors.json"), "utf8"),
);

export function checkExamples(): string[] {
	const problems: string[] = [];
	const expected = new Map<
		string,
		{ start: number; end: number; found: boolean }[]
	>();
	for (const [file, statements] of Object.entries(expectations)) {
		const text = readFileSync(join(docs, file), "utf8");
		let compact = "";
		const lines: number[] = [];
		let line = 1;
		for (const c of text) {
			if (!/\s/.test(c)) {
				compact += c;
				lines.push(line);
			}
			if (c === "\n") line++;
		}
		const ranges = statements.flatMap((statement) => {
			const needle = statement.replace(/\s/g, "");
			const at = compact.indexOf(needle);
			if (at < 0 || compact.indexOf(needle, at + 1) >= 0) {
				problems.push(
					`${file}: expected-error statement must occur exactly once: ${statement}`,
				);
				return [];
			}
			return [
				{
					start: lines[at]!,
					end: lines[at + needle.length - 1]!,
					found: false,
				},
			];
		});
		expected.set(resolve(docs, file), ranges);
	}
	const project = join(docs, "playground/tsconfig.json");
	const compiler = spawnSync(
		join(root, "node_modules/.bin/tsrs"),
		["-p", project, "--pretty", "false"],
		{
			cwd: root,
			encoding: "utf8",
		},
	);
	const output = compiler.stdout + compiler.stderr;
	const diagnostics = [
		...output.matchAll(/^(.+?)\((\d+),\d+\): error (TS\d+: .*)$/gm),
	];
	if (
		compiler.error ||
		compiler.signal ||
		(compiler.status !== 0 && diagnostics.length === 0)
	) {
		problems.push(
			`Example compiler failed: ${compiler.error?.message ?? compiler.signal ?? output}`,
		);
	}
	for (const [, file, row, message] of diagnostics) {
		const line = Number(row);
		const match = expected
			.get(resolve(root, file!))
			?.find((range) => line >= range.start && line <= range.end);
		if (match) match.found = true;
		else problems.push(`${file}:${row}: unexpected ${message}`);
	}
	for (const [file, ranges] of expected) {
		for (const range of ranges) {
			if (!range.found)
				problems.push(
					`${relative(root, file)}:${range.start}: expected an error but compiles`,
				);
		}
	}
	return problems;
}
