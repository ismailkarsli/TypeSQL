import { existsSync, readFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { type CommandIo, commandIo, errorMessage } from "@typesql/core/adapter";
import { loadConfig, type MigratorConfig } from "@typesql/core/migration";
import {
	advance,
	DEFAULT_WIDTH,
	type Dialect,
	type EditorKinds,
	editorKinds,
	type FormatOptions,
	formatLiteral,
	isCall,
	isSqlLiteral,
	type KeywordCase,
	type Position,
	type SqlText,
	textOf,
} from "@typesql/language-server/format";
import type { CallExpression, Node } from "typescript/ast";
import type { Checker, Project, Type } from "typescript/async";

const USAGE = `Usage: typesql format [files or directories…] [options]

Format the SQL that TypeSQL checks: the string argument of every call whose
parameter TypeSQL types as SQL, whatever the function, method or variable is
named. Keywords get one case and the spaces between tokens are tidied. The
SQL goes on one line if it fits, and otherwise on a clause per line, with an
item or condition per line in a clause that is still too long. Comments,
strings and names stay as written.

Options:
  --project <file>        tsconfig.json of the files (default: ./tsconfig.json)
  --config <file>         config module (default: ./typesql.config.ts)
  --keyword-case <case>   upper or lower; overrides config.format.keywordCase
                          (default: upper)
  --width <columns>       the column a line of SQL ends at; overrides
                          config.format.width (default: 80)
  --check                 write nothing, and exit with 1 if a file would change
  -h, --help              show this help

Without files, every file of the project and the projects it references is
formatted. Needs the typescript package, 7.1 or later.
`;

const parse = (argv: readonly string[]) =>
	parseArgs({
		args: [...argv],
		allowPositionals: true,
		options: {
			project: { type: "string" },
			config: { type: "string" },
			"keyword-case": { type: "string" },
			width: { type: "string" },
			check: { type: "boolean" },
			help: { type: "boolean", short: "h" },
		},
	});

/** 0: done, 1: the command failed or `--check` found a change, 2: a usage error. */
type ExitCode = 0 | 1 | 2;

const isKeywordCase = (s: unknown): s is KeywordCase =>
	s === "upper" || s === "lower";

export async function main(
	argv: readonly string[],
	given?: CommandIo,
): Promise<ExitCode> {
	const io = commandIo(given);
	let parsed: ReturnType<typeof parse>;
	try {
		parsed = parse(argv);
	} catch (error) {
		io.stderr(`typesql format: ${errorMessage(error)}\n\n${USAGE}`);
		return 2;
	}
	const { values, positionals } = parsed;
	if (values.help) {
		io.stdout(USAGE);
		return 0;
	}
	const flagCase = values["keyword-case"];
	if (flagCase !== undefined && !isKeywordCase(flagCase)) {
		io.stderr(
			`typesql format: --keyword-case must be upper or lower\n\n${USAGE}`,
		);
		return 2;
	}
	const flagWidth =
		values.width === undefined ? undefined : Number(values.width);
	if (
		flagWidth !== undefined &&
		(!Number.isInteger(flagWidth) || flagWidth <= 0)
	) {
		io.stderr(`typesql format: --width must be a positive integer\n\n${USAGE}`);
		return 2;
	}
	const print = (text: string) => io.stdout(`typesql format: ${text}\n`);
	// Importing the config runs it; that overlaps with TypeScript's work.
	const config: Promise<MigratorConfig | undefined> = loadConfig({
		cwd: io.cwd,
		config: values.config,
	});
	config.catch(() => {});
	try {
		const ts = await typescript(io.cwd);
		const api = new ts.API({ cwd: io.cwd });
		let files: FileSql[];
		try {
			files = await findSql(ts, api, {
				project: resolve(io.cwd, values.project ?? "tsconfig.json"),
				targets: positionals.map((p) => resolve(io.cwd, p)),
			});
		} finally {
			await api.close().catch(() => {});
		}
		const configured = await config;
		const keywordCase = flagCase ?? configured?.format?.keywordCase ?? "upper";
		const width = flagWidth ?? configured?.format?.width ?? DEFAULT_WIDTH;
		const fallback: Dialect = configured?.dialect ?? "postgres";
		const changed = files
			.map((file) => ({
				path: file.path,
				bom: file.bom,
				before: file.source,
				after: formatFile(file, ({ dialect, fragment }) => ({
					dialect: dialect ?? fallback,
					keywordCase,
					width,
					fragment,
				})),
			}))
			.filter((file) => file.after !== file.before);
		const name = (path: string) => relative(io.cwd, path) || path;
		if (values.check) {
			for (const file of changed) print(`${name(file.path)} is not formatted`);
			if (changed.length === 0) print("every file is formatted");
			return changed.length === 0 ? 0 : 1;
		}
		await Promise.all(
			changed.map((file) => writeFile(file.path, file.bom + file.after)),
		);
		for (const file of changed) print(`formatted ${name(file.path)}`);
		if (changed.length === 0) print("nothing to format");
		return 0;
	} catch (error) {
		io.stderr(`typesql format: ${errorMessage(error)}\n`);
		return 1;
	}
}

type TypeScript = typeof import("typescript/async") & {
	readonly SyntaxKind: typeof import("typescript/ast").SyntaxKind;
};
type Api = InstanceType<TypeScript["API"]>;

/** TypeScript's API, from the project's typescript package or else this one's. */
async function typescript(cwd: string): Promise<TypeScript> {
	const failures: unknown[] = [];
	for (const from of [join(cwd, "package.json"), import.meta.url]) {
		try {
			const require = createRequire(from);
			const load = (spec: string) =>
				import(pathToFileURL(require.resolve(spec)).href);
			const [api, ast] = await Promise.all([
				load("typescript/async"),
				load("typescript/ast"),
			]);
			if (typeof api.API === "function")
				return { ...api, SyntaxKind: ast.SyntaxKind };
		} catch (error) {
			failures.push(error);
		}
	}
	throw new Error(
		"formatting needs the typescript package (7.1 or later); install it as a dependency",
		{ cause: failures[0] },
	);
}

/** A file with SQL to format. */
interface FileSql {
	readonly path: string;
	readonly source: string;
	/** The byte order mark the file starts with, if it has one. */
	readonly bom: string;
	readonly literals: readonly FoundSql[];
}

interface FoundSql extends SqlParam {
	readonly sql: SqlText;
}

interface SqlParam {
	/** The dialect its type names, if it names one. */
	readonly dialect: Dialect | null;
	/** It takes a fragment, as `sql.fragment()` does, rather than a statement. */
	readonly fragment: boolean;
}

/** The SQL parameters of a callee's type, by index. */
type SqlParams = ReadonlyMap<number, SqlParam>;

/**
 * The files of `project` and the projects it references (or only those at
 * or under `targets`), with the SQL literals TypeSQL checks in each.
 */
async function findSql(
	ts: TypeScript,
	api: Api,
	options: { readonly project: string; readonly targets: readonly string[] },
): Promise<FileSql[]> {
	const configs = await projectConfigs(api, options.project);
	const snapshot = await api.createSnapshot({ openProjects: configs });
	try {
		const kinds = editorKinds(ts.SyntaxKind);
		const isTypeSql = typeSqlPaths();
		const seen = new Set<string>();
		const jobs: Promise<FileSql | null>[] = [];
		const matched = new Set<string>();
		for (const config of configs) {
			const project = snapshot.getConfiguredProject(config);
			if (!project) throw new Error(`cannot open the project ${config}`);
			const sqlParams = sqlParamsOf(ts, project.checker, isTypeSql);
			for (const path of project.parsedCommandLine.fileNames) {
				if (seen.has(path) || !isSource(path)) continue;
				const target = options.targets.find(
					(t) => path === t || path.startsWith(t.endsWith(sep) ? t : t + sep),
				);
				if (options.targets.length > 0 && target === undefined) continue;
				if (target !== undefined) matched.add(target);
				seen.add(path);
				jobs.push(sqlIn(project, path, kinds, sqlParams));
			}
		}
		const missing = options.targets.find((t) => !matched.has(t));
		if (missing !== undefined)
			throw new Error(
				`${missing} has no TypeScript file of ${options.project} or the projects it references`,
			);
		return (await Promise.all(jobs)).filter((f) => f !== null);
	} finally {
		await snapshot.dispose().catch(() => {});
	}
}

const isSource = (path: string): boolean =>
	/\.[cm]?[jt]sx?$/.test(path) &&
	!/\.d\.[cm]?ts$/.test(path) &&
	!/[\\/]node_modules[\\/]/.test(path);

/** `project` and the projects it references, transitively. */
async function projectConfigs(api: Api, project: string): Promise<string[]> {
	if (!existsSync(project))
		throw new Error(
			`there is no ${project}; pass the project's tsconfig.json with --project`,
		);
	const configs: string[] = [];
	const pending = [project];
	for (let config = pending.pop(); config; config = pending.pop()) {
		if (configs.includes(config)) continue;
		const parsed = await api.parseConfigFile(config).catch((cause) => {
			throw new Error(`cannot read ${config}`, { cause });
		});
		configs.push(config);
		for (const ref of parsed.projectReferences ?? [])
			pending.push(
				/\.json$/.test(ref.path) ? ref.path : join(ref.path, "tsconfig.json"),
			);
	}
	return configs;
}

/** A string after `(` or `,`, and any comments: maybe a call's argument. */
const STRING_ARGUMENT = /[(,]\s*(?:\/\*[\s\S]*?\*\/\s*)*["'`]/;

/** The SQL literals of a file: arguments whose parameter TypeSQL types as SQL. */
async function sqlIn(
	project: Project,
	path: string,
	kinds: EditorKinds,
	sqlParams: (t: Type) => Promise<SqlParams>,
): Promise<FileSql | null> {
	// Most files with no string argument are skipped before TypeScript sends their syntax tree.
	const written = await readFile(path, "utf8");
	if (!STRING_ARGUMENT.test(written)) return null;
	const file = await project.program.getSourceFile(path);
	if (!file) return null;
	const calls: CallExpression[] = [];
	const visit = (n: Node): void => {
		if (isCall(n, kinds) && n.arguments.some((a) => isSqlLiteral(a, kinds)))
			calls.push(n);
		n.forEachChild(visit);
	};
	visit(file);
	if (calls.length === 0) return null;
	const types = await project.checker.getTypeAtLocation(
		calls.map((c) => c.expression),
	);
	const params = await Promise.all(types.map((t) => sqlParams(t)));
	const literals: FoundSql[] = [];
	calls.forEach((call, i) => {
		for (const [index, param] of params[i] ?? []) {
			const literal = call.arguments[index];
			if (isSqlLiteral(literal, kinds))
				literals.push({ ...param, sql: textOf(file, literal, kinds) });
		}
	});
	// TypeScript reads a file without its byte order mark; it is written back.
	const bom = written === `\uFEFF${file.text}` ? "\uFEFF" : "";
	if (literals.length === 0 || (!bom && written !== file.text)) return null;
	return { path, source: file.text, bom, literals };
}

/**
 * Which parameters of a callee take SQL: those of a signature TypeSQL
 * declares whose type is a string type parameter (sql()'s also admits a
 * TemplateStringsArray) checked by a TypeSQL type, as
 * `query: GateCallCheck<…, Q> & Q` is, and `text: GateFragCheck<…> & Text` for
 * a fragment. Cached by type.
 */
function sqlParamsOf(
	ts: TypeScript,
	checker: Checker,
	isTypeSql: (path: string) => boolean,
): (t: Type) => Promise<SqlParams> {
	const cache = new Map<number, Promise<SqlParams>>();
	const sqlParam = async (t: Type): Promise<SqlParam | undefined> => {
		if (!t.isIntersectionType()) return undefined;
		const members = (await t.getTypes()) ?? [];
		const checked = await Promise.all(
			members.map(async (m) => {
				if (!m.isTypeParameter()) return false;
				const c = await checker.getConstraintOfTypeParameter(m);
				if (c === undefined) return false;
				// sql()'s Q also admits a TemplateStringsArray, to reject sql`…`.
				const options = c.isUnionType() ? await c.getTypes() : [c];
				return options.some((o) => (o.flags & ts.TypeFlags.String) !== 0);
			}),
		);
		if (!checked.includes(true)) return undefined;
		const checks = members.filter((m) => !m.isTypeParameter());
		const names = await Promise.all(
			checks.map(async (m) => (await m.getAliasSymbol())?.name),
		);
		const fragment = names.includes("GateFragCheck");
		for (const m of checks) {
			const dialect = await dialectOf(m);
			if (dialect) return { dialect, fragment };
		}
		return { dialect: null, fragment };
	};
	const analyze = async (t: Type): Promise<SqlParams> => {
		const out = new Map<number, SqlParam>();
		const signatures = await checker.getSignaturesOfType(
			t,
			ts.SignatureKind.Call,
		);
		for (const signature of signatures) {
			const declared = signature.declaration?.path;
			if (declared === undefined || !isTypeSql(declared)) continue;
			const parameters = await signature.getParameters();
			if (parameters.length === 0) continue;
			const types = await checker.getTypeOfSymbol(parameters);
			const found = await Promise.all(types.map(sqlParam));
			found.forEach((param, index) => {
				if (param !== undefined && !out.has(index)) out.set(index, param);
			});
		}
		return out;
	};
	return (t) => {
		let found = cache.get(t.id);
		if (!found) {
			found = analyze(t);
			cache.set(t.id, found);
		}
		return found;
	};
}

const ENGINES: readonly (readonly [RegExp, Dialect])[] = [
	[/^(?:Pg|Postgres)/, "postgres"],
	[/^Sqlite/, "sqlite"],
	[/^MariaDb/, "mariadb"],
	[/^MySql/, "mysql"],
];

/** The dialect of a check type, from its engine or dialect type argument. */
async function dialectOf(check: Type): Promise<Dialect | null> {
	for (const arg of await check.getAliasTypeArguments()) {
		const symbol = (await arg.getAliasSymbol()) ?? (await arg.getSymbol());
		const name = symbol?.name ?? "";
		const engine = ENGINES.find(([re]) => re.test(name));
		if (engine) return engine[1];
	}
	return null;
}

/** Whether a file belongs to a TypeSQL package: its package.json names one. */
function typeSqlPaths(): (path: string) => boolean {
	const packages = new Map<string, boolean>();
	const inPackage = (dir: string): boolean => {
		const known = packages.get(dir);
		if (known !== undefined) return known;
		let found: boolean;
		try {
			const manifest: { name?: unknown } = JSON.parse(
				readFileSync(join(dir, "package.json"), "utf8"),
			);
			found =
				typeof manifest.name === "string" &&
				manifest.name.startsWith("@typesql/");
		} catch {
			found = dirname(dir) !== dir && inPackage(dirname(dir));
		}
		packages.set(dir, found);
		return found;
	};
	return (path) => inPackage(dirname(path));
}

/**
 * A file's source with each literal formatted. A literal inside another's
 * `${…}` hole is formatted on one line to lay out the outer one, and then
 * again where it ends up in it.
 */
function formatFile(
	file: FileSql,
	options: (found: FoundSql) => FormatOptions,
): string {
	const { source } = file;
	// In source order, each literal before those in its holes.
	const literals = [...file.literals].sort(
		(a, b) => a.sql.start - b.sql.start || b.sql.end - a.sql.end,
	);
	/**
	 * `source` from `start` to `end` with each outermost literal in it
	 * formatted: where it is in the source, on one line to measure it, or
	 * after `at`, where `start` ends up.
	 */
	const render = (
		start: number,
		end: number,
		at: "source" | "measure" | Position,
	): string => {
		let out = "";
		let next = start;
		for (const found of literals) {
			const open = found.sql.start - 1;
			if (open < next || found.sql.end >= end) continue;
			out += source.slice(next, open);
			const placed =
				at === "source"
					? {}
					: at === "measure"
						? { width: Number.POSITIVE_INFINITY }
						: { position: advance(at, out) };
			const edit = formatLiteral(
				source,
				found.sql,
				{ ...options(found), ...placed },
				(s, e, position) => render(s, e, position ?? "measure"),
			);
			out += source.slice(open, edit.start) + edit.text;
			next = edit.end;
		}
		return out + source.slice(next, end);
	};
	return render(0, source.length, "source");
}
