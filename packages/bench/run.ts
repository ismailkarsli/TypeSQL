#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import {
	appendFileSync,
	existsSync,
	readFileSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { cpus } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compileFunction } from "node:vm";
import { createSql } from "@typesql/core";
import {
	isArrayTypeNode,
	isCallExpression,
	isIdentifier,
	isImportDeclaration,
	isLiteralTypeNode,
	isParenthesizedTypeNode,
	isPropertyAccessExpression,
	isPropertySignatureDeclaration,
	isTupleTypeNode,
	isTypeLiteralNode,
	isTypeReferenceNode,
	isUnionTypeNode,
	isVariableStatement,
	SyntaxKind,
	type TypeNode,
} from "tsrs/unstable/ast";
import { API } from "tsrs/unstable/sync";

const postgres = await import("@typesql/core/postgres").then(
	(m) => m.postgres,
	() => undefined,
);

interface Variant {
	name: string;
	files: string[];
	config?: typeof dist;
}

interface TscError {
	file: string;
	line: number;
	code: string;
	message: string;
}

interface Result {
	name: string;
	file: string;
	instantiations: number | null;
	types: number | null;
	checkTimeSec: number | null;
	totalTimeSec: number | null;
	wallTimeSec: number;
	memoryMB: number;
	errorCount: number;
	otherErrorCount: number;
	errors: TscError[];
	exitCode: number | null;
	samples?: Result[];
}

interface Threshold {
	instantiations: number;
	checkTimeSec: number;
	maxErrors: number;
}

type Thresholds = { [variant: string]: Threshold };

type Compiler = "tsrs" | "tsc";
const here = dirname(fileURLToPath(import.meta.url));
const fixture = "src/case1.ts";
const source = readFileSync(new URL(fixture, import.meta.url), "utf8");

function sample(type: TypeNode): string {
	if (isUnionTypeNode(type)) {
		const defined = type.types.find(
			(t) => t.kind !== SyntaxKind.UndefinedKeyword && t.getText() !== "null",
		);
		if (!defined) return "null";
		if (defined.getText().includes("\\0PJ")) return "undefined";
		return sample(defined);
	}
	if (isParenthesizedTypeNode(type)) return sample(type.type);
	if (isArrayTypeNode(type)) return `[${sample(type.elementType)}]`;
	if (isTupleTypeNode(type)) return `[${type.elements.map(sample).join(",")}]`;
	if (isLiteralTypeNode(type)) {
		return type.getText().includes("\\0PJ") ? '"{}"' : type.getText();
	}
	if (isTypeLiteralNode(type)) {
		return `{${type.members
			.flatMap((member) =>
				isPropertySignatureDeclaration(member) && member.type
					? [`${JSON.stringify(member.name.getText())}: ${sample(member.type)}`]
					: [],
			)
			.join(",")}}`;
	}
	if (isTypeReferenceNode(type)) {
		if (type.typeName.getText() === "Date")
			return 'new Date("2026-01-01T00:00:00Z")';
		if (type.typeName.getText() === "Record") return '{"sample": 1}';
	}
	switch (type.kind) {
		case SyntaxKind.StringKeyword:
			return '"sample"';
		case SyntaxKind.NumberKeyword:
			return "1";
		case SyntaxKind.BooleanKeyword:
			return "true";
		case SyntaxKind.TemplateLiteralType:
			return '"sample"';
		default:
			throw new Error(`No runtime sample for ${type.getText()}`);
	}
}

interface Workload {
	statements: number;
	build: () => { readonly text: string }[];
}

function loadWorkload(): Workload {
	const api = new API();
	const lease = api.createSourceFile(
		new URL(fixture, import.meta.url).pathname,
		source,
	);
	try {
		const edits: { start: number; end: number; text: string }[] = [];
		const queries: string[] = [];
		for (const statement of lease.sourceFile.statements) {
			if (isImportDeclaration(statement)) {
				edits.push({
					start: statement.getStart(),
					end: statement.end,
					text: "",
				});
				continue;
			}
			if (!isVariableStatement(statement)) continue;
			const hasModifier = (kind: SyntaxKind) =>
				statement.modifiers?.some((m) => m.kind === kind);
			if (hasModifier(SyntaxKind.DeclareKeyword)) {
				edits.push({
					start: statement.getStart(),
					end: statement.end,
					text: statement.declarationList.declarations
						.map((d) => {
							if (!d.type)
								throw new Error(`Missing input type: ${d.getText()}`);
							return `const ${d.name.getText()} = ${sample(d.type)};`;
						})
						.join("\n"),
				});
				continue;
			}
			if (!hasModifier(SyntaxKind.ExportKeyword)) continue;
			for (const d of statement.declarationList.declarations) {
				const call = d.initializer;
				if (!call || !isCallExpression(call)) continue;
				const callee = call.expression;
				if (
					(isIdentifier(callee) && callee.text === "sql") ||
					(isPropertyAccessExpression(callee) && callee.getText() === "sql.as")
				) {
					queries.push(d.name.getText());
					edits.push({
						start: call.getStart(),
						end: call.end,
						text: `() => (${call.getText()})`,
					});
				}
			}
			edits.push({
				start: statement.getStart(),
				end: statement.getStart() + "export ".length,
				text: "",
			});
		}
		let executable = source;
		for (const edit of edits.sort((a, b) => b.start - a.start)) {
			executable =
				executable.slice(0, edit.start) +
				edit.text +
				executable.slice(edit.end);
		}
		if (!queries.length) throw new Error("case1 contains no statements");
		const code = stripTypeScriptTypes(executable);
		const build = compileFunction(
			`${code}\nreturn () => [${queries.map((q) => `${q}()`).join(",")}];`,
			["createSql", "postgres"],
		)(createSql, postgres) as Workload["build"];
		return { statements: queries.length, build };
	} finally {
		lease.dispose();
		api.close();
	}
}

const compilerArg = process.argv.indexOf("--compiler");
const onlyCompiler =
	compilerArg === -1 ? undefined : process.argv[compilerArg + 1];
if (
	onlyCompiler !== undefined &&
	onlyCompiler !== "tsc" &&
	onlyCompiler !== "tsrs"
) {
	console.error(`unknown --compiler ${onlyCompiler}: use tsc or tsrs`);
	process.exit(2);
}
const compilers: Compiler[] = onlyCompiler ? [onlyCompiler] : ["tsrs", "tsc"];
const runsArg = process.argv.indexOf("--runs");
const runs = runsArg === -1 ? 1 : Number(process.argv[runsArg + 1]);
if (!Number.isSafeInteger(runs) || runs < 1) {
	throw new Error("--runs must be a positive integer");
}
const dist = { extends: "./tsconfig.json", compilerOptions: { paths: {} } };
const variants: Variant[] = [
	{ name: "case1", config: dist, files: [fixture] },
	{ name: "case1 source", files: [fixture] },
];
const application = loadWorkload();
const workload = { file: fixture, statements: application.statements };
const calibrate = process.argv.includes("--calibrate");
if (calibrate && onlyCompiler !== undefined) {
	console.error("--calibrate measures both compilers: drop --compiler");
	process.exit(2);
}
const thresholdsPath = join(here, "thresholds.json");

function measure(variant: Variant, compiler: Compiler): Result {
	const { name } = variant;
	const bin = join(here, "../../node_modules/.bin", compiler);
	const configPath = join(here, `tsconfig.${name.replaceAll(" ", "-")}.json`);
	writeFileSync(
		configPath,
		JSON.stringify(
			{
				...(variant.config ?? { extends: "./tsconfig.json" }),
				include: [],
				files: variant.files,
			},
			null,
			2,
		),
	);
	try {
		const started = performance.now();
		const args = ["--noEmit", "--extendedDiagnostics", "-p", configPath];
		const proc = spawnSync(bin, args, {
			cwd: here,
			encoding: "utf8",
		});
		const wallTimeSec = (performance.now() - started) / 1000;
		const out = `${proc.stdout ?? ""}${proc.stderr ?? ""}`;
		const num = (label: string): number | null => {
			const m = out.match(new RegExp(`^${label}:\\s+([\\d.]+)`, "m"));
			return m ? Number(m[1]) : null;
		};
		const errors = [
			...out.matchAll(/^(.*?)\((\d+),(\d+)\): error (TS\d+): (.*)$/gm),
		].map(
			(m): TscError => ({
				file: m[1]!,
				line: Number(m[2]),
				code: m[4]!,
				message: m[5]!,
			}),
		);
		const file = variant.files[0]!;
		const inFile = errors.filter((e) =>
			e.file.replaceAll("\\", "/").endsWith(file),
		);
		const result: Result = {
			name,
			file,
			instantiations: num("Instantiations"),
			types: num("Types"),
			checkTimeSec: num("Check time"),
			totalTimeSec: num("Total time"),
			wallTimeSec: Number(wallTimeSec.toFixed(3)),
			memoryMB: Math.round((num("Memory used") ?? 0) / 1024),
			errorCount: inFile.length,
			otherErrorCount: errors.length - inFile.length,
			errors,
			exitCode: proc.status,
		};
		return result;
	} finally {
		unlinkSync(configPath);
	}
}

const byCompiler = Object.fromEntries(
	compilers.map((c) => [
		c,
		variants.map((v): Result => {
			const samples = Array.from({ length: runs }, () => measure(v, c));
			const failed = samples.find(
				(r) =>
					r.exitCode !== 0 ||
					r.checkTimeSec == null ||
					r.instantiations == null,
			);
			const sorted = [...samples].sort(
				(a, b) => (a.checkTimeSec ?? 0) - (b.checkTimeSec ?? 0),
			);
			return { ...(failed ?? sorted[Math.floor(runs / 2)]!), samples };
		}),
	]),
) as Record<Compiler, Result[]>;
const primaryCompiler: Compiler = compilers[0]!;
const results = byCompiler[primaryCompiler];

function throughput(list: Result[]): {
	instantiationsPerQuery: number;
	checkMsPerQuery: number;
	queriesPerSec: number;
} | null {
	const result = list.find((r) => r.name === "case1");
	if (!result?.checkTimeSec || result.instantiations == null) return null;
	return {
		instantiationsPerQuery: Math.round(
			result.instantiations / workload.statements,
		),
		checkMsPerQuery: Number(
			((result.checkTimeSec * 1000) / workload.statements).toFixed(2),
		),
		queriesPerSec: Math.round(workload.statements / result.checkTimeSec),
	};
}
const throughputByCompiler = Object.fromEntries(
	compilers.map((c) => [c, throughput(byCompiler[c])]),
) as Record<Compiler, ReturnType<typeof throughput>>;
const perQuery = throughputByCompiler[primaryCompiler];

writeFileSync(
	join(here, "results.json"),
	`${JSON.stringify(
		{
			measuredAt: new Date().toISOString(),
			runs,
			workload,
			environment: {
				node: process.version,
				cpu: cpus()[0]?.model,
				cpus: cpus().length,
			},
			compilerVersions: Object.fromEntries(
				compilers.map((c) => [
					c,
					JSON.parse(
						readFileSync(
							join(
								here,
								"../../node_modules",
								c === "tsc" ? "typescript" : "tsrs",
								"package.json",
							),
							"utf8",
						),
					).version,
				]),
			),
			compiler: onlyCompiler ?? compilers,
			throughput: onlyCompiler ? perQuery : throughputByCompiler,
			results: onlyCompiler ? results : byCompiler,
		},
		null,
		2,
	)}\n`,
);

if (
	Object.values(byCompiler)
		.flat()
		.some(
			(r) =>
				r.exitCode !== 0 || r.instantiations == null || r.checkTimeSec == null,
		) &&
	calibrate
) {
	console.error("Cannot calibrate unsuccessful compiler runs");
	process.exit(1);
}
if (calibrate) {
	const thresholds: Thresholds = {};
	for (const [index, r] of results.entries()) {
		const measured = compilers.map((c) => byCompiler[c][index]!);
		thresholds[r.name] = {
			instantiations: Math.ceil(
				Math.max(...measured.map((r) => r.instantiations ?? 0)) * 1.3,
			),
			checkTimeSec: Math.max(
				1.5,
				Number(
					(Math.max(...measured.map((r) => r.checkTimeSec ?? 0)) * 2).toFixed(
						2,
					),
				),
			),
			maxErrors: 0,
		};
	}
	writeFileSync(thresholdsPath, `${JSON.stringify(thresholds)}\n`);
	console.log(
		`wrote thresholds.json (30% instantiation headroom, 2x check time)`,
	);
}

const thresholds: Thresholds =
	!process.argv.includes("--no-thresholds") && existsSync(thresholdsPath)
		? (JSON.parse(readFileSync(thresholdsPath, "utf8")) as Thresholds)
		: {};
const failures: { name: string; problems: string[] }[] = [];
const rows = results.map((r, idx) => {
	const t = thresholds[r.name];
	const problems: string[] = [];
	for (const c of compilers) {
		const rc = byCompiler[c][idx]!;
		const tag = compilers.length > 1 ? ` (${c})` : "";
		if (rc.exitCode !== 0)
			problems.push(`compiler${tag} exited with ${rc.exitCode}`);
		if (t) {
			if (rc.instantiations == null || rc.instantiations > t.instantiations)
				problems.push(`instantiations${tag} > ${t.instantiations}`);
			if (rc.checkTimeSec == null || rc.checkTimeSec > t.checkTimeSec)
				problems.push(`check time${tag} > ${t.checkTimeSec}s`);
			if (rc.errorCount > (t.maxErrors ?? 0))
				problems.push(`${rc.errorCount} error(s) in file${tag}`);
			if (rc.otherErrorCount > 0)
				problems.push(
					`${rc.otherErrorCount} error(s) outside the file${tag} (core does not compile?)`,
				);
		}
	}
	if (problems.length) failures.push({ name: r.name, problems });
	if (compilers.length === 1) {
		return {
			variant: r.name,
			file: r.file,
			instantiations: r.instantiations ?? "?",
			types: r.types ?? "?",
			"check s": r.checkTimeSec ?? "?",
			"total s": r.totalTimeSec ?? "?",
			"mem MB": r.memoryMB,
			errors: r.otherErrorCount
				? `${r.errorCount}+${r.otherErrorCount}`
				: r.errorCount,
			status: problems.length ? "FAIL" : t ? "ok" : "no threshold",
		};
	}
	const tsrsRes = byCompiler.tsrs[idx]!;
	const tscRes = byCompiler.tsc[idx]!;
	return {
		variant: r.name,
		file: r.file,
		instantiations: tsrsRes.instantiations ?? "?",
		types: tsrsRes.types ?? "?",
		"tsrs check s": tsrsRes.checkTimeSec ?? "?",
		"tsc check s": tscRes.checkTimeSec ?? "?",
		"tsrs total s": tsrsRes.totalTimeSec ?? "?",
		"tsc total s": tscRes.totalTimeSec ?? "?",
		"tsrs MB": tsrsRes.memoryMB,
		"tsc MB": tscRes.memoryMB,
		errors: tsrsRes.otherErrorCount
			? `${tsrsRes.errorCount}+${tsrsRes.otherErrorCount}`
			: tsrsRes.errorCount,
		status: problems.length ? "FAIL" : t ? "ok" : "no threshold",
	};
});

function table(objects: Record<string, unknown>[]): void {
	const keys = Object.keys(objects[0]!);
	const width = keys.map((k) =>
		Math.max(k.length, ...objects.map((o) => String(o[k]).length)),
	);
	const line = (vals: unknown[]): string =>
		vals.map((v, i) => String(v).padEnd(width[i]!)).join("  ");
	console.log(line(keys));
	console.log(width.map((w) => "-".repeat(w)).join("  "));
	for (const o of objects) console.log(line(keys.map((k) => o[k])));
}
table(rows);
for (const c of compilers) {
	const pq = throughputByCompiler[c];
	if (pq) {
		const label = compilers.length > 1 ? ` (${c})` : "";
		console.log(
			`\napplication average (${workload.statements} statements)${label}: ${pq.queriesPerSec} queries/s of check time, ${pq.checkMsPerQuery} ms and ${pq.instantiationsPerQuery} instantiations per query`,
		);
	}
}
if (process.env.GITHUB_STEP_SUMMARY) {
	const both = compilers.length > 1;
	const md = [
		`### ${failures.length ? "❌" : "✅"} Compile-time bench${onlyCompiler ? ` (${onlyCompiler})` : ""}`,
		"",
		`Workload: \`${workload.file}\` (${workload.statements} statements). Per-query figures are whole-application averages.`,
		"",
		...failures.map((f) => `- ${f.name}: ${f.problems.join(", ")}`),
		...(failures.length ? [""] : []),
		both
			? "| variant | instantiations | check s (`tsrs`) | check s (`tsc`) | status |"
			: "| variant | instantiations | check s | status |",
		both ? "|---|---:|---:|---:|---|" : "|---|---:|---:|---|",
		...rows.map((r) =>
			both
				? `| ${r.variant} | ${r.instantiations} | ${(r as Record<string, unknown>)["tsrs check s"]} | ${(r as Record<string, unknown>)["tsc check s"]} | ${r.status} |`
				: `| ${r.variant} | ${r.instantiations} | ${(r as Record<string, unknown>)["check s"]} | ${r.status} |`,
		),
		"",
		...compilers
			.map((c) => {
				const pq = throughputByCompiler[c];
				if (!pq) return "";
				const label = both ? ` (${c})` : "";
				return `Throughput${label}: **${pq.queriesPerSec} queries/s** of check time (${pq.checkMsPerQuery} ms, ${pq.instantiationsPerQuery} instantiations per query).`;
			})
			.filter(Boolean),
	];
	appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${md.join("\n")}\n`);
}
for (const c of compilers)
	for (const r of byCompiler[c])
		for (const e of r.errors)
			console.log(
				`  [${r.name}${compilers.length > 1 ? `/${c}` : ""}] ${e.file}:${e.line} ${e.code} ${e.message.slice(0, 140)}`,
			);

if (failures.length) {
	console.error(`\nthreshold violations:`);
	for (const f of failures)
		console.error(`  ${f.name}: ${f.problems.join(", ")}`);
	process.exit(1);
}
console.log("\nall files within thresholds");

function measureRuntime(): void {
	const { statements, build } = application;
	const iterations = 3_000;
	let sink: ReturnType<typeof build> = [];
	for (let i = 0; i < iterations / 10; i++) sink = build();
	const started = performance.now();
	for (let i = 0; i < iterations; i++) sink = build();
	const totalMs = performance.now() - started;
	if (sink.length !== statements || sink.some((q) => !q.text)) {
		throw new Error("case1 did not build every statement");
	}
	const results = {
		workload: { file: fixture, statements },
		iterations,
		microsecondsPerQuery: Number(
			((totalMs * 1000) / iterations / statements).toFixed(2),
		),
		millisecondsPerWorkload: Number((totalMs / iterations).toFixed(2)),
	};
	console.log(
		`${fixture}: ${results.microsecondsPerQuery} µs per query, ${results.millisecondsPerWorkload} ms for ${statements} statements`,
	);
	writeFileSync(
		new URL("./runtime-results.json", import.meta.url),
		`${JSON.stringify(results, null, "\t")}\n`,
	);
}

measureRuntime();
