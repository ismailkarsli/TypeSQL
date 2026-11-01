import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const docs = join(root, "packages/docs");
/** For each file, each statement that must not compile and a part of its error. */
const expectations: Record<string, Record<string, string>> = JSON.parse(
	readFileSync(join(docs, "expected-errors.json"), "utf8"),
);

export function checkExamples(): string[] {
	const problems: string[] = [];
	const expected = new Map<
		string,
		{
			start: number;
			end: number;
			statement: string;
			message: string;
			found: boolean;
		}[]
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
		const ranges = Object.entries(statements).flatMap(
			([statement, message]) => {
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
						statement,
						message,
						found: false,
					},
				];
			},
		);
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
		// The error is the statement's own, not one that hides it (such as an
		// argument count). Messages print a SqlError's quotes escaped.
		if (match && message!.replaceAll('\\"', '"').includes(match.message))
			match.found = true;
		else problems.push(`${file}:${row}: unexpected ${message}`);
	}
	for (const [file, ranges] of expected) {
		for (const range of ranges) {
			if (!range.found)
				problems.push(
					`${relative(root, file)}:${range.start}: expected an error containing ${JSON.stringify(range.message)}: ${range.statement}`,
				);
		}
	}
	return problems;
}
