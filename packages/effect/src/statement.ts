import type {
	InlineStatement,
	PARAMS,
	ROW,
	SqlPlugin,
	StatementObject,
} from "@typesql/core";
import {
	type DialectFamily,
	familyStatement,
	mapRows,
	mysqlBind,
	mysqlResult,
	type PositionalStatement,
	pluginsOf,
	SqlStatement,
	type StatementFn,
	type StatementParams,
} from "@typesql/core/adapter";
import { Data, Effect, Effectable, Predicate, Stream } from "effect";
import { SqlClient } from "effect/sql/SqlClient";
import type { SqlError } from "effect/sql/SqlError";
import { pgValue } from "./pg-value.js";

export class NoResultError extends Data.TaggedError("NoResultError")<{
	readonly text: string;
}> {
	override readonly message = "The query returned no rows";
}

export class TooManyRowsError extends Data.TaggedError("TooManyRowsError")<{
	readonly text: string;
	readonly count: number;
}> {
	override readonly message =
		`The query returned ${this.count} rows, expected at most one`;
}

export interface EffectQueryObject<
	Row,
	Params extends readonly unknown[],
	Text extends string,
	R,
> extends StatementObject<Text> {
	readonly [ROW]?: Row;
	readonly [PARAMS]?: Params;
	exec(): Effect.Effect<Row[], SqlError, R>;
	/** The only row; fails with `NoResultError` on 0 rows and `TooManyRowsError` on more than one. */
	execOne(): Effect.Effect<Row, SqlError | NoResultError | TooManyRowsError, R>;
	/** The only row, or `undefined` on 0 rows; fails with `TooManyRowsError` on more than one. */
	execOneOrNone(): Effect.Effect<
		Row | undefined,
		SqlError | TooManyRowsError,
		R
	>;
	/** @deprecated Use `execOneOrNone()`, which fails on more than one row, or `exec()` and take `[0]`. */
	execTakeFirstOrNone(): Effect.Effect<Row | undefined, SqlError, R>;
	/** @deprecated Use `execOne()`, which fails on more than one row, or `exec()` and take `[0]`. */
	execTakeFirst(): Effect.Effect<Row, SqlError | NoResultError, R>;
	execCount(): Effect.Effect<number, SqlError, R>;
	stream(): Stream.Stream<Row, SqlError, R>;
}

/** A statement: the Effect of its rows, as `exec()` is. */
export type EffectQuery<
	Row,
	Params extends readonly unknown[] = readonly unknown[],
	Text extends string = string,
	R = SqlClient,
> = EffectQueryObject<Row, Params, Text, R> &
	InlineStatement &
	Effect.Effect<Row[], SqlError, R>;

export interface EffectStatement<R> extends StatementFn {
	readonly out: EffectQuery<
		this["row"],
		StatementParams<this["params"]>,
		this["text"],
		R
	>;
}

/** Runs `use` on the client createSql() got, or the fiber's. */
export type OnClient = <A, E, R>(
	use: (client: SqlClient) => Effect.Effect<A, E, R>,
) => Effect.Effect<A, E, R | SqlClient>;

export const onClient = (client: SqlClient | undefined): OnClient =>
	client
		? (use) => Effect.suspend(() => use(client))
		: (use) => SqlClient.use(use);

const compile = (
	family: DialectFamily,
	text: string,
	values: readonly unknown[],
): PositionalStatement =>
	familyStatement[family](
		text,
		values,
		family === "postgres"
			? pgValue
			: family === "mysql"
				? mysqlBind
				: undefined,
	);

const COUNTS = ["rowCount", "affectedRows", "changes", "rowsAffected"] as const;

function countOf<Raw>(family: DialectFamily, raw: Raw, driver: string): number {
	if (Array.isArray(raw))
		return family === "mysql" ? (mysqlResult(raw).rowCount ?? 0) : raw.length;
	if (Predicate.isObject(raw))
		for (const key of COUNTS) {
			const count = raw[key];
			if (Predicate.isNumber(count) || Predicate.isBigInt(count))
				return Number(count);
		}
	throw new Error(
		`typesql: the "${driver}" SqlClient driver gave no row count; use exec()`,
	);
}

class Statement extends Effectable.Mixin(SqlStatement) {
	readonly #family: DialectFamily;
	readonly #on: OnClient;
	constructor(
		text: string,
		values: readonly unknown[],
		plugins: readonly SqlPlugin[],
		family: DialectFamily,
		on: OnClient,
	) {
		super(text, values, plugins);
		this.#family = family;
		this.#on = on;
	}
	#run<A, E>(
		use: (client: SqlClient, q: PositionalStatement) => Effect.Effect<A, E>,
	): Effect.Effect<A, E, SqlClient> {
		return this.#on((client) =>
			use(client, compile(this.#family, this.text, this.values)),
		);
	}
	asEffect(): Effect.Effect<unknown[], SqlError, SqlClient> {
		return this.exec();
	}
	exec(): Effect.Effect<unknown[], SqlError, SqlClient> {
		return this.#run((client, q) =>
			Effect.map(client.unsafe(q.text, q.values).withoutTransform, (rows) =>
				mapRows(this, rows),
			),
		);
	}
	execOne(): Effect.Effect<
		unknown,
		SqlError | NoResultError | TooManyRowsError,
		SqlClient
	> {
		return Effect.flatMap(this.#atMostOne(), (rows) =>
			rows.length
				? Effect.succeed(rows[0])
				: Effect.fail(new NoResultError({ text: this.text })),
		);
	}
	execOneOrNone(): Effect.Effect<
		unknown,
		SqlError | TooManyRowsError,
		SqlClient
	> {
		return Effect.map(this.#atMostOne(), (rows) => rows[0]);
	}
	#atMostOne(): Effect.Effect<
		unknown[],
		SqlError | TooManyRowsError,
		SqlClient
	> {
		return Effect.flatMap(this.exec(), (rows) =>
			rows.length > 1
				? Effect.fail(
						new TooManyRowsError({ text: this.text, count: rows.length }),
					)
				: Effect.succeed(rows),
		);
	}
	execTakeFirstOrNone(): Effect.Effect<unknown, SqlError, SqlClient> {
		return Effect.map(this.exec(), (rows) => rows[0]);
	}
	execTakeFirst(): Effect.Effect<unknown, SqlError | NoResultError, SqlClient> {
		return Effect.flatMap(this.exec(), (rows) =>
			rows.length
				? Effect.succeed(rows[0])
				: Effect.fail(new NoResultError({ text: this.text })),
		);
	}
	execCount(): Effect.Effect<number, SqlError, SqlClient> {
		return this.#run((client, q) =>
			Effect.map(client.unsafe(q.text, q.values).raw, (raw) =>
				countOf(this.#family, raw, client.driver),
			),
		);
	}
	stream(): Stream.Stream<unknown, SqlError, SqlClient> {
		const rows = Stream.unwrap(
			this.#run((client, q) =>
				Effect.succeed(
					client.withoutTransforms().unsafe(q.text, q.values).stream,
				),
			),
		);
		return pluginsOf(this)[0]
			? Stream.map(rows, (row) => mapRows(this, [row])[0])
			: rows;
	}
	// Effect's prototype has a toString() of its own; `${statement}` needs the marker.
	override toString(): string {
		return SqlStatement.prototype.toString.call(this);
	}
	override toJSON() {
		return { text: this.text, values: this.values };
	}
}

export const statementOf =
	(family: DialectFamily, on: OnClient) =>
	(
		text: string,
		values: readonly unknown[],
		plugins: readonly SqlPlugin[],
	): SqlStatement =>
		new Statement(text, values, plugins, family, on);
