import { runTransaction } from "./transaction.js";

export { mapRows, pluginsOf } from "./query.js";
export { JsonParam } from "./runtime/json.js";
export { mysqlPositional, mysqlValue } from "./runtime/mysql-params.js";
export {
	type PgField,
	type PgLookup,
	parsePgArray,
	parsePgUserArrays,
} from "./runtime/pg-arrays.js";
export {
	paramNumbers,
	positional,
	type SplitStatement,
	splitParams,
	sqliteValue,
} from "./runtime/sqlite-params.js";
export {
	createTransactionalSql,
	runTransaction,
	type SqlDriver,
} from "./transaction.js";

const queues = new WeakMap<WeakKey, Promise<unknown>>();

export function serialTransaction<T>(
	client: WeakKey,
	depth: number,
	run: (statement: string) => Promise<void>,
	fn: () => Promise<T>,
): Promise<T> {
	if (depth > 0)
		return runTransaction(run, fn, { savepoint: `typesql_${depth}` });
	const current = (queues.get(client) ?? Promise.resolve()).then(() =>
		runTransaction(run, fn),
	);
	queues.set(
		client,
		current.catch(() => undefined),
	);
	return current;
}

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

export const propertyKey = (name: string): string =>
	IDENT.test(name) ? name : JSON.stringify(name);

export const globRegExp = (glob: string): RegExp =>
	new RegExp(
		`^${glob
			.split("*")
			.map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
			.join(".*")}$`,
	);

export function colSource(
	type: string,
	nullable: boolean,
	hasDefault: boolean,
): string {
	const flags = [
		...(nullable ? ["nullable: true"] : []),
		...(hasDefault ? ["hasDefault: true"] : []),
	];
	return flags.length > 0
		? `Col<${type}, { ${flags.join("; ")} }>`
		: `Col<${type}>`;
}

export function schemaMembers<R>(
	relations: readonly R[],
	schemaOf: (relation: R) => string,
	member: (relation: R, indent: string) => string,
): string[] {
	const lines: string[] = [];
	const namespaces = new Map<string, R[]>();
	for (const relation of relations) {
		const schema = schemaOf(relation);
		if (schema === "public") lines.push(member(relation, "  "));
		else namespaces.set(schema, [...(namespaces.get(schema) ?? []), relation]);
	}
	for (const [schema, members] of namespaces) {
		const body = members.map((relation) => member(relation, "    "));
		lines.push(`  ${propertyKey(schema)}: {\n${body.join("\n")}\n  };`);
	}
	return lines;
}

export interface CommandIo {
	readonly stdout: (s: string) => void;
	readonly stderr: (s: string) => void;
}

export function introspectArgs<V extends { readonly help?: boolean }>(
	io: CommandIo,
	usage: string,
	parse: () => { readonly values: V; readonly positionals: string[] },
): V | number {
	let parsed: ReturnType<typeof parse>;
	try {
		parsed = parse();
	} catch (err) {
		io.stderr(`${err instanceof Error ? err.message : err}\n\n${usage}`);
		return 2;
	}
	const { values, positionals } = parsed;
	if (values.help || positionals.length === 0) {
		(values.help ? io.stdout : io.stderr)(usage);
		return values.help ? 0 : 2;
	}
	if (positionals[0] !== "introspect" || positionals.length > 1) {
		io.stderr(`unknown command: ${positionals.join(" ")}\n\n${usage}`);
		return 2;
	}
	return values;
}
