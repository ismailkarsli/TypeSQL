import type { Query } from "@typesql/core";
import type { Sql } from "@typesql/core/postgres";
import type { BetterAuthOptions } from "better-auth";
import {
	type AdapterFactoryConfig,
	type AdapterFactoryCustomizeAdapterCreator,
	type CleanedWhere,
	type CustomAdapter,
	createAdapterFactory,
	type DBAdapter,
	type DBAdapterDebugLogOption,
	type JoinConfig,
	type ModelTarget,
} from "better-auth/adapters";
import {
	type Dialect,
	quote,
	Statement,
	table,
	where,
	whereClause,
} from "./statement.js";

/** Options of {@link typesqlAdapter}. */
export interface TypesqlAdapterConfig<D extends Dialect = Dialect> {
	/** The database `sql` runs on: `"postgres"` or `"sqlite"`. It must match the `sql`'s dialect. */
	readonly dialect: D;
	/**
	 * Run Better Auth's multi-step writes in one `sql.transaction()`.
	 *
	 * @default false
	 */
	readonly transaction?: boolean | undefined;
	/**
	 * Use plural table names (`users`, not `user`).
	 *
	 * @default false
	 */
	readonly usePlural?: boolean | undefined;
	/**
	 * Better Auth's adapter debug logs: `true` for every method, or an object of methods.
	 *
	 * @default false
	 */
	readonly debugLogs?: DBAdapterDebugLogOption | undefined;
}

type Brand<D extends Dialect> = {
	readonly name: D;
	readonly inputs: (inputs: [never, never, []]) => [unknown, unknown, []];
};

type BrandKey = Extract<keyof Sql<unknown, unknown>, symbol>;

interface Runner {
	as<R>(query: string, ...params: readonly unknown[]): Query<R>;
}

type Branded<D extends Dialect, Self> = [
	Extract<keyof Self, BrandKey>,
] extends [never]
	? { readonly "a TypeSQL sql": never }
	: { readonly [K in BrandKey]?: Brand<D> };

/** The `sql` of a TypeSQL driver or ORM package for dialect `D`, without plugins. */
export type TypesqlAdapterSql<D extends Dialect, Self> = Runner &
	Branded<D, Self> & {
		transaction<T>(fn: (tx: Self) => Promise<T>): Promise<T>;
	};

/**
 * A Better Auth database adapter that runs on a TypeSQL `sql` from
 * `@typesql/pg`, `@typesql/postgres`, `@typesql/sqlite` or `@typesql/kysely`.
 *
 * @example
 * ```ts
 * const auth = betterAuth({
 *   database: typesqlAdapter(sql, { dialect: "postgres" }),
 * });
 * ```
 */
export function typesqlAdapter<
	D extends Dialect,
	S extends TypesqlAdapterSql<D, S>,
>(
	sql: S,
	config: TypesqlAdapterConfig<D>,
): (options: BetterAuthOptions) => DBAdapter {
	const { dialect } = config;
	const settings: AdapterFactoryConfig = {
		adapterId: "typesql",
		adapterName: "TypeSQL Adapter",
		usePlural: config.usePlural ?? false,
		debugLogs: config.debugLogs ?? false,
		supportsUUIDs: dialect === "postgres",
		supportsDates: dialect === "postgres",
		supportsBooleans: dialect === "postgres",
		supportsJSON: dialect === "postgres",
		supportsArrays: false,
		customTransformOutput: ({ data, field, fieldAttributes }) => {
			if (field === "id" || fieldAttributes.references) return data;
			const numeric = typeof data === "string" || typeof data === "bigint";
			if (fieldAttributes.type === "number" && numeric) return Number(data);
			if (fieldAttributes.type === "boolean" && typeof data === "bigint")
				return data === 1n;
			if (fieldAttributes.type === "date" && typeof data === "string")
				return new Date(data);
			return data;
		},
	};
	return (options) => {
		const create = (
			db: Runner,
			transaction: AdapterFactoryConfig["transaction"],
		): DBAdapter =>
			createAdapterFactory({
				config: { ...settings, transaction },
				adapter: (helpers) => ({
					...adapter(db, dialect, helpers),
					options: config,
				}),
			})(options);
		return create(
			sql,
			config.transaction
				? (callback) => sql.transaction((tx) => callback(create(tx, false)))
				: false,
		);
	};
}

function adapter(
	db: Runner,
	dialect: Dialect,
	{
		getFieldName,
		getDefaultModelName,
		schema,
	}: Parameters<AdapterFactoryCustomizeAdapterCreator>[0],
): CustomAdapter {
	const all = <T>(s: Statement, text: string) =>
		db.as<T>(text, ...s.values).execute();
	const one = async <T>(s: Statement, text: string) =>
		(await all<T>(s, text))[0] ?? null;
	const changed = (s: Statement, text: string) =>
		db.as(text, ...s.values).executeCount();
	const keyOf = ({ model, modelKey }: ModelTarget) =>
		modelKey ?? getDefaultModelName(model);
	const column = (target: ModelTarget, field: string) =>
		quote(getFieldName({ model: keyOf(target), field }));

	const assignments = (s: Statement, values: object) =>
		Object.entries(values)
			.filter(([, value]) => value !== undefined)
			.map(([key, value]) => `${quote(key)} = ${s.param(value)}`);
	const countOf = async (s: Statement, model: string, text: string) => {
		const row = await one<{ n: number | string | bigint }>(
			s,
			`SELECT COUNT(*) AS "n" FROM ${table(model)}${text}`,
		);
		return Number(row?.n ?? 0);
	};
	const oneRow = (
		s: Statement,
		target: ModelTarget,
		clauses: readonly CleanedWhere[],
	) => {
		const { model } = target;
		const id = column(target, "id");
		const guard = where(s, clauses);
		return ` WHERE ${id} IN (SELECT ${id} FROM ${table(model)}${whereClause(s, clauses)} LIMIT 1)${guard === undefined ? "" : ` AND ${guard}`}`;
	};
	const columnsOf = (modelKey: string) => [
		...new Set([
			getFieldName({ model: modelKey, field: "id" }),
			...Object.entries(schema[modelKey]?.fields ?? {}).map(
				([field, attributes]) => attributes.fieldName || field,
			),
		]),
	];
	const joins = (s: Statement, model: string, join: JoinConfig = {}) =>
		Object.entries(join)
			.map(([name, { modelKey, on, relation, limit }]) => {
				const many = relation !== "one-to-one";
				const rows = `SELECT * FROM ${table(name)} AS "_j" WHERE "_j".${quote(on.to)} = ${table(model)}.${quote(on.from)} LIMIT ${s.param(many ? (limit ?? 100) : 1)}`;
				const row =
					dialect === "postgres"
						? `to_json("j")`
						: `json_object(${columnsOf(modelKey ?? getDefaultModelName(name))
								.map((c) => `${s.param(c)}, "j".${quote(c)}`)
								.join(", ")})`;
				const value = !many
					? row
					: dialect === "postgres"
						? `COALESCE(json_agg(${row}), '[]')`
						: `json_group_array(${row})`;
				return `, (SELECT ${value} FROM (${rows}) AS "j") AS ${quote(name)}`;
			})
			.join("");
	const read = async <T>(s: Statement, text: string, join: JoinConfig = {}) => {
		const names = Object.keys(join);
		const rows = await all<T & object>(s, text);
		if (names.length === 0) return rows;
		return rows.map((row) =>
			Object.assign(
				row,
				Object.fromEntries(
					Object.entries(row)
						.filter(
							([key, value]) =>
								names.includes(key) && typeof value === "string",
						)
						.map(([key, value]) => [key, JSON.parse(value)]),
				),
			),
		);
	};
	const select = (
		s: Statement,
		target: ModelTarget,
		query: {
			readonly where?: readonly CleanedWhere[] | undefined;
			readonly select?: readonly string[] | undefined;
			readonly sortBy?:
				| { readonly field: string; readonly direction: "asc" | "desc" }
				| undefined;
			readonly limit: number;
			readonly offset?: number | undefined;
			readonly join?: JoinConfig | undefined;
		},
	) => {
		const { model } = target;
		const columns = query.select?.length
			? query.select.map((field) => column(target, field)).join(", ")
			: `${table(model)}.*`;
		let text = `SELECT ${columns}${joins(s, model, query.join)} FROM ${table(model)}${whereClause(s, query.where)}`;
		if (query.sortBy)
			text += ` ORDER BY ${column(target, query.sortBy.field)} ${query.sortBy.direction === "desc" ? "DESC" : "ASC"}`;
		text += ` LIMIT ${s.param(query.limit)}`;
		if (query.offset !== undefined) text += ` OFFSET ${s.param(query.offset)}`;
		return text;
	};

	return {
		async create({ model, data }) {
			const s = new Statement(dialect);
			const entries = Object.entries(data).filter(([, v]) => v !== undefined);
			const columns = entries.map(([key]) => quote(key)).join(", ");
			const values = entries.map(([, value]) => s.param(value)).join(", ");
			const row = await one<typeof data>(
				s,
				entries.length === 0
					? `INSERT INTO ${table(model)} DEFAULT VALUES RETURNING *`
					: `INSERT INTO ${table(model)} (${columns}) VALUES (${values}) RETURNING *`,
			);
			if (row === null)
				throw new Error(`typesql: INSERT INTO ${model} returned no row`);
			return row;
		},
		async findOne<T>({
			model,
			modelKey,
			...query
		}: Parameters<CustomAdapter["findOne"]>[0]) {
			const s = new Statement(dialect);
			const text = select(s, { model, modelKey }, { ...query, limit: 1 });
			return (await read<T>(s, text, query.join))[0] ?? null;
		},
		async findMany<T>({
			model,
			modelKey,
			...query
		}: Parameters<CustomAdapter["findMany"]>[0]) {
			const s = new Statement(dialect);
			const text = select(s, { model, modelKey }, query);
			return read<T>(s, text, query.join);
		},
		async count({ model, where }) {
			const s = new Statement(dialect);
			return countOf(s, model, whereClause(s, where));
		},
		async update({ model, modelKey, where, update }) {
			if (where.length === 0 || typeof update !== "object" || update === null)
				return null;
			const s = new Statement(dialect);
			const set = assignments(s, update);
			if (set.length === 0)
				return one(
					s,
					`SELECT * FROM ${table(model)}${whereClause(s, where)} LIMIT 1`,
				);
			return one(
				s,
				`UPDATE ${table(model)} SET ${set.join(", ")}${oneRow(s, { model, modelKey }, where)} RETURNING *`,
			);
		},
		async updateMany({ model, where, update }) {
			const s = new Statement(dialect);
			const set = assignments(s, update);
			if (set.length === 0) return countOf(s, model, whereClause(s, where));
			return changed(
				s,
				`UPDATE ${table(model)} SET ${set.join(", ")}${whereClause(s, where)}`,
			);
		},
		async delete({ model, where }) {
			const s = new Statement(dialect);
			await changed(s, `DELETE FROM ${table(model)}${whereClause(s, where)}`);
		},
		async deleteMany({ model, where }) {
			const s = new Statement(dialect);
			return changed(s, `DELETE FROM ${table(model)}${whereClause(s, where)}`);
		},
		async consumeOne({ model, modelKey, where }) {
			const s = new Statement(dialect);
			return one(
				s,
				`DELETE FROM ${table(model)}${oneRow(s, { model, modelKey }, where)} RETURNING *`,
			);
		},
		async incrementOne({ model, modelKey, where, increment, set }) {
			const s = new Statement(dialect);
			const assigned = [
				...Object.entries(increment).map(
					([key, delta]) => `${quote(key)} = ${quote(key)} + ${s.param(delta)}`,
				),
				...assignments(s, set ?? {}),
			];
			return one(
				s,
				`UPDATE ${table(model)} SET ${assigned.join(", ")}${oneRow(s, { model, modelKey }, where)} RETURNING *`,
			);
		},
	};
}
