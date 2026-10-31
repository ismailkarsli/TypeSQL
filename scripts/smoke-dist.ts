import assert from "node:assert/strict";
import { EnvelopePlugin } from "../packages/core/examples/plugins.ts";
import type {
	Col,
	Json,
	Postgres,
} from "../packages/core/src/postgres/index.ts";

type Core = typeof import("../packages/core/src/index.ts");
type CoreAdapter = typeof import("../packages/core/src/adapter.ts");
type CorePostgres = typeof import("../packages/core/src/postgres/index.ts");
type CoreSqlite = typeof import("../packages/core/src/sqlite/index.ts");
interface AdapterSql {
	(text: string): unknown;
	param(value: unknown): string;
	transaction<T>(
		fn: (tx: (text: string) => { execute(): Promise<T> }) => Promise<T>,
	): Promise<T>;
}
interface Adapter {
	readonly [name: string]: unknown;
	createSql(client?: unknown): AdapterSql;
}
interface Introspect {
	readonly [name: string]: unknown;
	generateSource(db: unknown): string;
}
const dist = (path: string): Promise<unknown> =>
	import(new URL(`../packages/${path}`, import.meta.url).href);

const core = (await dist("core/dist/index.js")) as Core;
const coreAdapter = (await dist("core/dist/adapter.js")) as CoreAdapter;
const corePg = (await dist("core/dist/postgres/index.js")) as CorePostgres;
for (const name of ["rowKeysOf", "camelCase", "snakeCase"]) {
	assert.equal(name in core, false, `Removed core export ${name}`);
	assert.equal(name in coreAdapter, false, `Removed adapter export ${name}`);
}
const pg = (await dist("pg/dist/index.js")) as Adapter;
const pgjs = (await dist("postgres/dist/index.js")) as Adapter;
const coreSqlite = (await dist("core/dist/sqlite/index.js")) as CoreSqlite;
const sqliteAdapter = (await dist("sqlite/dist/index.js")) as Adapter;

interface DB {
	users: {
		id: Col<"int4">;
		email: Col<"text">;
		age: Col<"int4">;
		display_name: Col<"text">;
	};
	docs: { items: Json<number[]> };
	preferences: {
		email: Col<"text">;
		retries: Col<"int4", { hasDefault: true }>;
		note: Col<"text", { nullable: true }>;
	};
}
const sql = core.createSql<DB>(corePg.postgres);
assert.deepEqual(sql("SELECT id FROM users WHERE id = $1", 7), {
	text: "SELECT id FROM users WHERE id = $1",
	values: [7],
});

const where = sql.fragment("AND age > :min", { min: 18 });
assert.deepEqual(
	sql(
		"SELECT id FROM users WHERE email = :email {where}",
		{ where },
		{ email: "a@b.c" },
	),
	{
		text: "SELECT id FROM users WHERE email = $1 AND age > $2",
		values: ["a@b.c", 18],
	},
);
assert.deepEqual(
	sql("SELECT {col} FROM users", { col: sql.id("display_name") }),
	{ text: 'SELECT "display_name" FROM users', values: [] },
);
assert.deepEqual(sql.id('quoted"name'), {
	text: '"quoted""name"',
	values: [],
});
assert.deepEqual(sql.id('quoted"schema', 'quoted"name'), {
	text: '"quoted""schema"."quoted""name"',
	values: [],
});

const camelWrites = core
	.createSql<{
		write_rows: {
			display_name: Col<"text">;
			optional_name: Col<"text", { nullable: true; hasDefault: true }>;
			json_data: Json<{ innerKey: string }>;
		};
	}>(corePg.postgres)
	.withPlugin(new core.CasePlugin());
const writeModel = {
	displayName: "Ada",
	optionalName: null,
	jsonData: { innerKey: "kept" },
};
const camelInserted = camelWrites(
	"INSERT INTO write_rows {rows} RETURNING display_name, optional_name",
	{
		rows: camelWrites.values("write_rows", [
			{ ...writeModel, jsonData: camelWrites.json(writeModel.jsonData) },
			{
				...writeModel,
				optionalName: undefined,
				jsonData: camelWrites.json(writeModel.jsonData),
			},
		]),
	},
);
assert.equal(
	camelInserted.text,
	'INSERT INTO write_rows ("display_name", "optional_name", "json_data") VALUES ($1, $2, $3), ($4, DEFAULT, $5) RETURNING display_name, optional_name',
);
assert.deepEqual(camelInserted.values.slice(0, 2), ["Ada", null]);
assert.equal(JSON.stringify(camelInserted.values[2]), '{"innerKey":"kept"}');
assert.equal(JSON.stringify(camelInserted.values[4]), '{"innerKey":"kept"}');
const singleRow = {
	displayName: "Ada",
	optionalName: undefined,
	jsonData: camelWrites.json(writeModel.jsonData),
};
assert.deepEqual(camelWrites.values("write_rows", [singleRow]), {
	text: '("display_name", "json_data") VALUES ($1, $2)',
	values: ["Ada", camelInserted.values[2]],
});
assert.deepEqual(Object.keys(singleRow), [
	"displayName",
	"optionalName",
	"jsonData",
]);
assert.throws(
	() => camelWrites.values("write_rows", [singleRow]),
	/already used/,
);
const defaults = core.createSql<{
	defaults: { id: Col<"int4", { hasDefault: true }> };
}>(corePg.postgres);
assert.deepEqual(defaults.values("defaults", [{ id: undefined }]), {
	text: "DEFAULT VALUES",
	values: [],
});
const camelUpdated = camelWrites(
	"UPDATE write_rows SET {changes} RETURNING display_name",
	{
		changes: camelWrites.set("write_rows", {
			...writeModel,
			optionalName: undefined,
			jsonData: camelWrites.json(writeModel.jsonData),
		}),
	},
);
assert.equal(
	camelUpdated.text,
	'UPDATE write_rows SET "display_name" = $1, "json_data" = $2 RETURNING display_name',
);
assert.equal(camelUpdated.values[0], "Ada");
assert.equal(JSON.stringify(camelUpdated.values[1]), '{"innerKey":"kept"}');
assert.deepEqual(
	sql("UPDATE users SET {changes}", {
		changes: sql.set("users", { display_name: "Ada" }),
	}),
	{
		text: 'UPDATE users SET "display_name" = $1',
		values: ["Ada"],
	},
);

// Plugins share the same pipeline in execution, preparation, fragments and transactions.
const casePlugin = new core.CasePlugin();
assert.deepEqual(
	casePlugin.transformInput(
		{ displayName: 1, HTTPStatus: 2, already_snake: 3, "": 4, ÄName: 5 },
		{ kind: "set", table: "unused" },
	),
	{ display_name: 1, _h_t_t_p_status: 2, already_snake: 3, "": 4, Ä_name: 5 },
);
const cased = sql.withPlugin(casePlugin);
const encodedWrite = cased(
	"UPDATE users SET {changes} RETURNING display_name",
	{
		changes: cased.set("users", { displayName: "Ada" }),
	},
);
assert.equal(
	encodedWrite.text,
	'UPDATE users SET "display_name" = $1 RETURNING display_name',
);
assert.deepEqual(encodedWrite.values, ["Ada"]);
const databaseRows = [
	{ display_name: "Ada", json_data: { inner_key: "kept" } },
];
const outputRows = [{ displayName: "Ada", jsonData: { inner_key: "kept" } }];
const resultQuery = cased("SELECT display_name FROM users");
assert.deepEqual(core.mapRows(resultQuery, databaseRows), outputRows);
assert.deepEqual(
	await resultQuery.execute(async () => databaseRows),
	outputRows,
);
assert.deepEqual(
	await resultQuery.executeTakeFirst(async () => databaseRows),
	outputRows[0],
);
assert.deepEqual(
	await resultQuery.executeTakeFirstOrThrow(async () => databaseRows),
	outputRows[0],
);
assert.equal(await resultQuery.executeTakeFirst(async () => []), undefined);
await assert.rejects(
	resultQuery.executeTakeFirstOrThrow(async () => []),
	core.NoResultError,
);
assert.equal(
	await resultQuery.executeCount(async () => ({
		rows: databaseRows,
		rowCount: 9,
	})),
	9,
);
assert.deepEqual(
	core.mapRows(sql("SELECT display_name FROM users"), databaseRows),
	databaseRows,
);
assert.deepEqual(databaseRows, [
	{ display_name: "Ada", json_data: { inner_key: "kept" } },
]);
assert.ok(Object.isFrozen(core.pluginsOf(resultQuery)));
const specialRow = core.mapRows(resultQuery, [
	JSON.parse('{"__proto__":"safe","user_id":1}'),
])[0] as unknown as Record<string, unknown>;
assert.equal(specialRow["_Proto"], "safe");
assert.equal(Object.getPrototypeOf(specialRow), Object.prototype);

const enveloped = cased.withPlugin(new EnvelopePlugin());
const envelopeQuery = enveloped(
	"SELECT display_name FROM users WHERE id = $1",
	[7],
);
assert.deepEqual(envelopeQuery.values, [7]);
assert.deepEqual(
	await envelopeQuery.execute(async () => databaseRows),
	outputRows.map((data) => ({ data })),
);
assert.deepEqual(
	core.mapRows(envelopeQuery, databaseRows),
	outputRows.map((data) => ({ data })),
);
assert.deepEqual(
	enveloped.prepare("SELECT display_name FROM users WHERE id = :id")([
		{ id: 8 },
	]).values,
	[8],
);
assert.deepEqual(
	enveloped("SELECT display_name FROM users WHERE id = :id", [{ id: 9 }])
		.values,
	[9],
);
assert.deepEqual(
	enveloped(
		`SELECT display_name FROM users WHERE id = ${enveloped.param({ data: 10 })}`,
		[],
	).values,
	[10],
);
const envelopedWhere = enveloped.fragment("AND age > $1", [18]);
assert.deepEqual(
	enveloped(
		"SELECT display_name FROM users WHERE id = $1 {where}",
		{ where: envelopedWhere },
		[7],
	).values,
	[7, 18],
);
assert.deepEqual(
	enveloped.prepare("SELECT display_name FROM users WHERE id = $1 {where}", {
		where: envelopedWhere,
	})([8]).values,
	[8, 18],
);
assert.deepEqual(
	enveloped(
		"UPDATE users SET {changes} WHERE id = $1",
		{
			changes: enveloped.set("users", { data: { displayName: "Grace" } }),
		},
		[9],
	).values,
	[9, "Grace"],
);
const envelopeInsert = enveloped(
	"INSERT INTO users {rows}",
	{
		rows: enveloped.values("users", [
			{ data: { id: 1, email: "a@b.c", age: 18, displayName: "Ada" } },
		]),
	},
	[],
);
assert.match(envelopeInsert.text, /"display_name"/);
assert.deepEqual(envelopeInsert.values, [1, "a@b.c", 18, "Ada"]);
assert.equal(
	(
		await envelopeQuery.executeTakeFirstOrThrow(async () => databaseRows)
	).data.displayName.toUpperCase(),
	"ADA",
);

const preparedCalls: unknown[] = [];
const prepareExecutor = Object.assign(async () => databaseRows, {
	prepare: (text: string) => {
		preparedCalls.push(text);
		return async (_text: string, values: readonly unknown[]) => {
			preparedCalls.push(values);
			return databaseRows;
		};
	},
});
const preparedSql = core
	.createSql<DB>(corePg.postgres, prepareExecutor)
	.withPlugin(casePlugin)
	.withPlugin(new EnvelopePlugin());
const preparedPluginQuery = preparedSql.prepare(
	"SELECT display_name FROM users WHERE id = $1",
);
assert.deepEqual(
	await preparedPluginQuery([11]).execute(),
	outputRows.map((data) => ({ data })),
);
assert.deepEqual(preparedCalls, [
	"SELECT display_name FROM users WHERE id = $1",
	[11],
]);

const transactionalPlugins = coreAdapter
	.createTransactionalSql<
		Postgres,
		DB,
		import("../packages/core/src/postgres/index.ts").DefaultTypeMap,
		object
	>(
		corePg.postgres,
		{},
		{
			executor: () => async () => databaseRows,
			transaction: (client, _depth, fn) => fn(client),
		},
	)
	.withPlugin(casePlugin)
	.withPlugin(new EnvelopePlugin());
await transactionalPlugins.transaction(async (tx) => {
	const query = tx("SELECT display_name FROM users WHERE id = $1", [1]);
	assert.deepEqual(
		await query.execute(),
		outputRows.map((data) => ({ data })),
	);
	await tx.transaction(async (nested) => {
		assert.equal(
			(
				await nested(
					"SELECT display_name FROM users",
					[],
				).executeTakeFirstOrThrow()
			).data.displayName,
			"Ada",
		);
	});
	await tx.withPlugin(new EnvelopePlugin()).transaction(async (nested) => {
		assert.equal(
			(
				await nested("SELECT display_name FROM users", [
					[],
				]).executeTakeFirstOrThrow()
			).data.data.displayName,
			"Ada",
		);
	});
});
const reversed = sql.withPlugin(new EnvelopePlugin()).withPlugin(casePlugin);
assert.deepEqual(
	core.mapRows(reversed("SELECT display_name FROM users", []), databaseRows),
	databaseRows.map((data) => ({ data })),
);

const evil = "x'; DROP TABLE users; --";
for (const includeEmail of [false, true]) {
	const filters = sql.combine(
		[
			sql.empty,
			sql.fragment("id > $1", 5),
			sql.empty(includeEmail ? sql.fragment("email = $1", evil) : null),
			sql.empty,
			sql.fragment("age > $1", 18),
			sql.empty,
		],
		{ separator: " AND " },
	);
	assert.deepEqual(sql("SELECT id FROM users WHERE {filters}", { filters }), {
		text: includeEmail
			? "SELECT id FROM users WHERE id > $1 AND email = $2 AND age > $3"
			: "SELECT id FROM users WHERE id > $1 AND age > $2",
		values: includeEmail ? [5, evil, 18] : [5, 18],
	});
	const items = [sql.empty, sql.fragment("$1", evil), sql.empty];
	assert.deepEqual(sql.combine(items), { text: "$1", values: [evil] });
}
assert.deepEqual(
	sql.combine([sql.empty, sql.id("id"), sql.empty, sql.id("email")]),
	{
		text: '"id", "email"',
		values: [],
	},
);
for (const includeEmail of [false, true]) {
	const filters = sql.and([
		sql.empty,
		sql.fragment("id > $1", 5),
		sql.empty(includeEmail ? sql.fragment("email = $1", evil) : null),
		sql.or([sql.fragment("age > $1", 18), sql.fragment("age < $1", 3)]),
	]);
	assert.deepEqual(
		sql("SELECT id FROM users WHERE id <> $1 AND {filters}", { filters }, 0),
		{
			text: includeEmail
				? "SELECT id FROM users WHERE id <> $1 AND ((id > $2) AND (email = $3) AND ((age > $4) OR (age < $5)))"
				: "SELECT id FROM users WHERE id <> $1 AND ((id > $2) AND ((age > $3) OR (age < $4)))",
			values: includeEmail ? [0, 5, evil, 18, 3] : [0, 5, 18, 3],
		},
	);
}
assert.deepEqual(sql.and([sql.fragment("id = $1 OR id = $2", 1, 2)]), {
	text: "(id = $1 OR id = $2)",
	values: [1, 2],
});
assert.deepEqual(sql.and([]), { text: "true", values: [] });
assert.deepEqual(sql.and([sql.empty]), { text: "true", values: [] });
assert.deepEqual(sql.or([]), { text: "false", values: [] });
assert.deepEqual(sql.or([sql.empty, sql.empty]), { text: "false", values: [] });
assert.deepEqual(sql.and([sql.fragment("id = 1"), sql.or([])]), {
	text: "((id = 1) AND false)",
	values: [],
});
assert.throws(() => {
	// @ts-expect-error undefined must be made explicit with sql.empty.
	sql.and([undefined]);
}, /sql\.and\(\) does not accept null or undefined/);
assert.throws(() => {
	// @ts-expect-error null is not a fragment or the omission sentinel.
	sql.or([null]);
}, /sql\.or\(\) does not accept null or undefined/);
assert.throws(() => sql.combine([]), /needs at least one item/);
assert.throws(
	() => sql.combine([sql.empty, sql.empty]),
	/needs at least one item/,
);
assert.throws(() => {
	// @ts-expect-error undefined must be made explicit with sql.empty.
	sql.combine([undefined]);
}, /does not accept null or undefined/);
assert.throws(() => {
	// @ts-expect-error null is not a fragment or the omission sentinel.
	sql.combine([null]);
}, /does not accept null or undefined/);
assert.throws(() => {
	// @ts-expect-error undefined no longer implicitly requests DEFAULT.
	sql.param(undefined);
}, /does not accept undefined/);

assert.equal(sql.empty(null), sql.empty);
assert.equal(sql.empty(undefined), sql.empty);
assert.equal(sql.empty(sql.empty), sql.empty);
const required = sql.fragment("id > $1", 5);
assert.equal(sql.empty(required), required);
assert.throws(() => sql.combine(new Array<typeof required>(1)), /undefined/);
for (const value of [0, false, "", null] as const) {
	assert.deepEqual(sql(`SELECT ${sql.param(value)}`), {
		text: "SELECT $1",
		values: [value],
	});
	if (value !== null) {
		assert.equal(sql.empty(value), value);
		assert.deepEqual(sql(`SELECT ${sql.param(sql.empty(value))}`), {
			text: "SELECT $1",
			values: [value],
		});
	}
}
for (const value of [0, 7, null, undefined]) {
	for (const optional of [value ?? sql.empty, sql.empty(value)]) {
		assert.deepEqual(
			sql(
				`UPDATE preferences SET retries = ${sql.param(optional)} WHERE email = ${sql.param(evil)}`,
			),
			{
				text:
					value === null || value === undefined
						? "UPDATE preferences SET retries = DEFAULT WHERE email = $1"
						: "UPDATE preferences SET retries = $1 WHERE email = $2",
				values: value === null || value === undefined ? [evil] : [value, evil],
			},
		);
	}
}
assert.throws(
	() => sql.as("SELECT $1", sql.empty),
	/cannot be a bound parameter/,
);
assert.throws(
	() => sql.as("SELECT $1", sql.param(sql.empty)),
	/must be interpolated inline/,
);

assert.deepEqual(
	sql(
		`SELECT id FROM users WHERE email = ${sql.param(evil)} AND id > ${sql.param(3)}`,
	),
	{
		text: "SELECT id FROM users WHERE email = $1 AND id > $2",
		values: [evil, 3],
	},
);

const doc = sql(`UPDATE docs SET items = ${sql.json([1, 2])}`);
assert.equal(doc.text, "UPDATE docs SET items = $1");
assert.ok(doc.values[0] instanceof coreAdapter.JsonParam);
assert.equal(doc.values[0].toPostgres(), "[1,2]");
assert.equal(JSON.stringify(doc.values[0]), "[1,2]");

// Inline rewriting keeps explicit offsets, repeated tokens and DEFAULT values.
const repeated = sql.param("repeat");
assert.deepEqual(
	sql.as(
		`SELECT $2, ${repeated}, ${repeated}, ${sql.param(sql.empty)}, '$99', "$88" -- $77\n`,
		1,
		2,
	),
	{
		text: `SELECT $2, $3, $4, DEFAULT, '$99', "$88" -- $77\n`,
		values: [1, 2, "repeat", "repeat"],
	},
);
assert.throws(() => sql.as(`SELECT ${repeated}`), /already used/);
for (const [open, close] of [
	["'", "'"],
	['"', '"'],
	["/*", "*/"],
	["--", "\n"],
]) {
	const token = sql.param(42);
	assert.throws(
		() => sql.as(`SELECT ${open}${token}${close}`),
		/cannot be used inside/,
	);
	assert.deepEqual(sql.as(`SELECT ${token}`), {
		text: "SELECT $1",
		values: [42],
	});
}
const piece = sql.fragment("$1, '$99', $$ $88 $$", 3);
assert.deepEqual(sql.as("SELECT $2, {piece}, {piece}", { piece }, 1, 2), {
	text: "SELECT $2, $3, '$99', $$ $88 $$, $4, '$99', $$ $88 $$",
	values: [1, 2, 3, 3],
});
// A `$` without digits (regex anchors, dollar quotes) survives renumbering in the types too.
const anchored = sql.fragment(
	"(SELECT u.id FROM users u WHERE u.email ~ '^a$' AND u.age = $1 AND u.display_name <> $tag$ $1 $tag$ ORDER BY substring(u.display_name FROM '[0-9]+$')::int LIMIT 1) AS x",
	30,
);
assert.deepEqual(
	sql(`SELECT {anchored} FROM users WHERE id = ${sql.param(7)}`, {
		anchored,
	}),
	{
		text: "SELECT (SELECT u.id FROM users u WHERE u.email ~ '^a$' AND u.age = $2 AND u.display_name <> $tag$ $1 $tag$ ORDER BY substring(u.display_name FROM '[0-9]+$')::int LIMIT 1) AS x FROM users WHERE id = $1",
		values: [7, 30],
	},
);

// sql.json() accepts recursive JSON types such as zod's `JSONType`.
type JsonTree =
	| string
	| number
	| boolean
	| null
	| JsonTree[]
	| { [key: string]: JsonTree };
const notes = core.createSql<{
	notes: {
		id: Col<"uuid", { hasDefault: true }>;
		extra_data: Json<JsonTree, { nullable: true }>;
	};
}>(corePg.postgres);
const note: { extra_data?: JsonTree | null } = {
	extra_data: { tags: ["a", ["b"]] },
};
const noteInsert = notes(`INSERT INTO notes {v} RETURNING *`, {
	v: notes.values("notes", [{ extra_data: notes.json(note.extra_data) }]),
});
assert.equal(
	noteInsert.text,
	'INSERT INTO notes ("extra_data") VALUES ($1) RETURNING *',
);
assert.equal(JSON.stringify(noteInsert.values[0]), '{"tags":["a",["b"]]}');

const m = corePg
	.migrations()
	.add("CREATE TABLE t (id int)")
	.add("ALTER TABLE t ADD COLUMN x text");
assert.deepEqual(
	[...m.statements],
	["CREATE TABLE t (id int)", "ALTER TABLE t ADD COLUMN x text"],
);

for (const name of [
	"createTransactionalSql",
	"runTransaction",
	"mapRows",
] as const) {
	assert.equal(
		typeof coreAdapter[name],
		"function",
		`@typesql/core/adapter export ${name}`,
	);
}

for (const name of [
	"createSql",
	"Migrations",
	"NoResultError",
	"runMigrations",
] as const) {
	assert.equal(typeof core[name], "function", `@typesql/core export ${name}`);
}
assert.ok(
	!("createSql" in corePg),
	"@typesql/core/postgres exports a dialect, not createSql",
);
assert.equal(corePg.postgres.name, "postgres");
const custom = core.createSql<Postgres, DB>({ name: "custom" });
const inner = custom("SELECT id FROM users WHERE id = $1", 1);
assert.deepEqual(inner, {
	text: "SELECT id FROM users WHERE id = $1",
	values: [1],
});
assert.deepEqual(
	custom(
		"SELECT id FROM users WHERE age > $1 AND id IN ({inner})",
		{ inner },
		2,
	),
	{
		text: "SELECT id FROM users WHERE age > $1 AND id IN (SELECT id FROM users WHERE id = $2)",
		values: [2, 1],
	},
);
const tx = coreAdapter.createTransactionalSql(corePg.postgres, undefined, {
	executor: () => async () => [],
	transaction: (_client, _depth, fn) => fn(undefined),
}) as AdapterSql;
assert.deepEqual(tx(`SELECT ${tx.param(1)}`), {
	text: "SELECT $1",
	values: [1],
});
assert.equal(typeof tx.transaction, "function");

for (const adapter of [pg, pgjs]) {
	assert.deepEqual(
		adapter.createSql()(`SELECT ${adapter.createSql().param(1)}`),
		{ text: "SELECT $1", values: [1] },
	);
	for (const name of ["createSql", "executor", "migrate"]) {
		assert.equal(typeof adapter[name], "function", `adapter export ${name}`);
	}
	assert.deepEqual(adapter.createSql()("SELECT 1"), {
		text: "SELECT 1",
		values: [],
	});
	assert.equal(typeof adapter.createSql().transaction, "function");
}

assert.equal(coreSqlite.sqlite.name, "sqlite");
assert.ok(
	!("createSql" in coreSqlite),
	"@typesql/core/sqlite exports a dialect, not createSql",
);
const lite = core.createSql<{ t: { a: Col<"integer">; b: Col<"text"> } }>(
	coreSqlite.sqlite,
);
assert.deepEqual(lite.values("t", [{ a: 1, b: "x" }]), {
	text: '("a", "b") VALUES ($1, $2)',
	values: [1, "x"],
});
assert.throws(
	() => lite.values("t", [{ a: 1, b: "x" }, { a: 2 }] as never),
	/no DEFAULT in VALUES/,
);
assert.deepEqual(
	[
		...coreSqlite.migrations().add("CREATE TABLE t (id INTEGER PRIMARY KEY)")
			.statements,
	],
	["CREATE TABLE t (id INTEGER PRIMARY KEY)"],
);

const { DatabaseSync } = await import("node:sqlite");
const pluginDb = new DatabaseSync(":memory:");
try {
	pluginDb.exec(
		"CREATE TABLE plugin_rows (user_id INTEGER PRIMARY KEY, display_name TEXT, json_data TEXT NOT NULL)",
	);
	const adapter =
		sqliteAdapter as unknown as typeof import("../packages/sqlite/src/index.ts");
	const sqlitePlugins = adapter
		.createSql<{
			plugin_rows: {
				user_id: Col<"integer">;
				display_name: Col<"text", { nullable: true }>;
				json_data: Col<"text">;
			};
		}>(pluginDb)
		.withPlugin(new core.CasePlugin())
		.withPlugin(new EnvelopePlugin());
	const sqlitePluginQuery = sqlitePlugins(
		"INSERT INTO plugin_rows {rows} RETURNING user_id, display_name, json_data",
		{
			rows: sqlitePlugins.values("plugin_rows", [
				{
					data: {
						userId: 1,
						displayName: null,
						jsonData: '{"inner_key":"kept"}',
					},
				},
			]),
		},
		[],
	);
	assert.equal(
		sqlitePluginQuery.text,
		'INSERT INTO plugin_rows ("user_id", "display_name", "json_data") VALUES ($1, $2, $3) RETURNING user_id, display_name, json_data',
	);
	assert.deepEqual(await sqlitePluginQuery.execute(), [
		{
			data: { userId: 1, displayName: null, jsonData: '{"inner_key":"kept"}' },
		},
	]);
	await sqlitePlugins.transaction(async (tx) => {
		await tx(
			"UPDATE plugin_rows SET {changes} WHERE user_id = $1",
			{
				changes: tx.set("plugin_rows", { data: { displayName: "Ada" } }),
			},
			[1],
		).execute();
		const read = tx.prepare(
			"SELECT display_name FROM plugin_rows WHERE user_id = :id",
		);
		assert.equal(
			(await read([{ id: 1 }]).executeTakeFirstOrThrow()).data.displayName,
			"Ada",
		);
	});
} finally {
	pluginDb.close();
}

const db = new DatabaseSync(":memory:");
for (const name of ["createSql", "executor", "migrate"])
	assert.equal(
		typeof sqliteAdapter[name],
		"function",
		`@typesql/sqlite export ${name}`,
	);
await (sqliteAdapter.migrate as (db: unknown, m: unknown) => Promise<void>)(
	db,
	{
		statements: [
			"CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT NOT NULL, meta TEXT)",
		],
	},
);
interface LiteQuery {
	execute(): Promise<unknown[]>;
	executeCount(): Promise<number>;
}
const lsql = sqliteAdapter.createSql(db) as unknown as {
	(text: string, ...values: unknown[]): LiteQuery;
	transaction<T>(
		fn: (tx: (text: string) => LiteQuery) => Promise<T>,
	): Promise<T>;
	json(value: unknown): string;
};
const inserted = await lsql(
	"INSERT INTO users (email, meta) VALUES ($1, $2) RETURNING id, email",
	"a@b.c",
	lsql.json({ x: [1] }),
).execute();
assert.deepEqual(
	inserted.map((r) => ({ ...(r as object) })),
	[{ id: 1, email: "a@b.c" }],
);
assert.equal(
	await lsql(
		"UPDATE users SET email = $2 WHERE id = $1",
		1,
		"z@b.c",
	).executeCount(),
	1,
);
const selected = await lsql(
	"SELECT $1 || email AS e, json_extract(meta, '$.x[0]') AS x FROM users WHERE id = $2",
	"<",
	1,
).execute();
assert.deepEqual(
	selected.map((r) => ({ ...(r as object) })),
	[{ e: "<z@b.c", x: 1 }],
);
await assert.rejects(
	lsql.transaction(async (t) => {
		await t("INSERT INTO users (email) VALUES ('rolled back')").execute();
		throw new Error("boom");
	}),
	/boom/,
);
assert.equal(
	(
		(await lsql("SELECT count(*) AS n FROM users").execute()) as {
			n: number;
		}[]
	)[0]?.n,
	1,
);
const liteIntrospect = (await dist("sqlite/dist/introspect/index.js")) as {
	introspect(db: unknown): unknown;
	generateSource(db: unknown): string;
};
assert.match(
	liteIntrospect.generateSource(liteIntrospect.introspect(db)),
	/id: Col<"integer", \{ hasDefault: true; position: 0; rowid: true \}>;/,
);
db.close();

const positional = (
	coreAdapter as unknown as {
		positional(
			text: string,
			values: readonly unknown[],
		): { text: string; values: unknown[] };
	}
).positional;
assert.deepEqual(positional("SELECT $2, '$1', \"$1\", $1 -- $3", ["a", true]), {
	text: "SELECT ?, '$1', \"$1\", ? -- $3",
	values: [1, "a"],
});
for (const name of ["kysely", "drizzle", "prisma"]) {
	const orm = (await dist(`${name}/dist/index.js`)) as {
		createSql(dialect: unknown): (text: string, ...v: unknown[]) => unknown;
	};
	assert.deepEqual(orm.createSql(coreSqlite.sqlite)("SELECT $1", 1), {
		text: "SELECT $1",
		values: [1],
	});
}

const introspect = (await dist("pg/dist/introspect/index.js")) as Introspect;
for (const name of ["introspect", "generateSource"]) {
	assert.equal(
		typeof introspect[name],
		"function",
		`@typesql/pg/introspect export ${name}`,
	);
}
const generated = introspect.generateSource({
	version: "17.0",
	schemas: ["public"],
	relations: [
		{
			schema: "public",
			name: "t",
			kind: "table",
			comment: null,
			columns: [
				{
					name: "id",
					type: "int4",
					declaredType: "integer",
					domain: null,
					nullable: false,
					hasDefault: true,
					identity: null,
					generated: null,
					default: null,
					comment: null,
				},
			],
		},
	],
	enums: [],
});
assert.match(generated, /id: Col<"int4", \{ hasDefault: true \}>;/);

const prismaGenerator = (await dist("prisma/dist/generator/api.js")) as {
	readonly [name: string]: unknown;
};
assert.deepEqual(
	Object.keys(prismaGenerator),
	["generateSource"],
	"@typesql/prisma/generator exports",
);
assert.match(
	(
		prismaGenerator.generateSource as (
			dm: unknown,
			o: { dialect: "sqlite" },
		) => string
	)(
		{
			models: [
				{
					name: "User",
					dbName: null,
					fields: [
						{
							name: "id",
							kind: "scalar",
							type: "Int",
							isList: false,
							isRequired: true,
							hasDefaultValue: true,
							default: { name: "autoincrement", args: [] },
						},
					],
				},
			],
			enums: [],
		},
		{ dialect: "sqlite" },
	),
	/from "@typesql\/core\/sqlite";[\s\S]*id: Col<"integer", \{ hasDefault: true \}>;/,
);

const { execFileSync } = await import("node:child_process");
const cliBin = new URL("../packages/cli/dist/bin.js", import.meta.url).pathname;
const cli = (...args: string[]): string =>
	execFileSync(process.execPath, [cliBin, ...args], { encoding: "utf8" });
assert.match(
	cli("--help"),
	/^Usage: typesql migrate <up\|down\|latest\|make name\|generate>/,
);
assert.match(
	cli("introspect", "--dialect", "postgres", "--help"),
	/^Usage: typesql introspect \[--dialect postgres\]/,
);
assert.match(
	cli("introspect", "--dialect=sqlite", "--help"),
	/^Usage: typesql introspect --dialect sqlite/,
);
{
	const { mkdtempSync, rmSync } = await import("node:fs");
	const { tmpdir } = await import("node:os");
	const { join } = await import("node:path");
	const dir = mkdtempSync(join(tmpdir(), "typesql-cli-"));
	try {
		const file = join(dir, "app.db");
		const lite = new DatabaseSync(file);
		lite.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT NOT NULL)");
		lite.close();
		assert.match(
			cli("introspect", "--db", file),
			/name: Col<"text", \{ position: 1 \}>;/,
		);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

// Exercise the published migration entry point against an actual SQLite database.
{
	const migration = (await dist(
		"core/dist/migration/index.js",
	)) as typeof import("../packages/core/src/migration/index.ts");
	const {
		existsSync,
		mkdirSync,
		mkdtempSync,
		readFileSync,
		renameSync,
		rmSync,
		writeFileSync,
	} = await import("node:fs");
	const { tmpdir } = await import("node:os");
	const { join } = await import("node:path");
	const dir = mkdtempSync(join(tmpdir(), "typesql-migrations-"));
	const migrationsDir = join(dir, "migrations");
	writeFileSync(join(dir, "package.json"), '{"type":"module"}\n');
	mkdirSync(migrationsDir);
	const migrationDb = new DatabaseSync(":memory:");
	const options = {
		dialect: "sqlite" as const,
		migrationsDir,
		migrationTable: 'tracked"migrations',
		execute: Object.assign(
			async (text: string, values: readonly unknown[]) => {
				const query = positional(text, values);
				return migrationDb
					.prepare(query.text)
					.all(...(query.values as import("node:sqlite").SQLInputValue[]));
			},
			{
				count: async (text: string, values: readonly unknown[]) => {
					const query = positional(text, values);
					return Number(
						migrationDb
							.prepare(query.text)
							.run(...(query.values as import("node:sqlite").SQLInputValue[]))
							.changes,
					);
				},
			},
		),
	};
	const history = () =>
		migrationDb
			.prepare('SELECT name FROM "tracked""migrations" ORDER BY name')
			.all()
			.map((row) => row.name);
	const first = `import type { SqliteMigration } from '@typesql/core/migration';
export async function up(db: SqliteMigration) {
  const next = await db.add('CREATE TABLE accounts (id INTEGER PRIMARY KEY, email TEXT NOT NULL, note TEXT)');
  const inserted = await next('INSERT INTO accounts (email, note) VALUES ($1, $2)', 'a@b.c', null).executeCount();
  if (inserted !== 1) throw new Error('Migration executor lost its count callback');
  await next.raw('SAVEPOINT nested');
  await next('INSERT INTO accounts (email) VALUES ($1)', 'rolled-back').execute();
  await next.raw('ROLLBACK TRANSACTION TO SAVEPOINT nested');
  await next.raw('RELEASE SAVEPOINT nested');
  return next;
}
export async function down(db: SqliteMigration) { return db.add('DROP TABLE accounts'); }
`;
	const second = `export async function up(db: unknown) { return db; }
export async function down() {}
`;
	try {
		assert.deepEqual((await migration.migrateDown(options)).migrations, []);
		assert.equal(
			migrationDb
				.prepare("SELECT name FROM sqlite_master WHERE name = ?")
				.get(options.migrationTable),
			undefined,
			"an empty command does not create its tracking table",
		);
		writeFileSync(
			join(migrationsDir, "alpha.ts"),
			"export async function up() {}",
		);
		await assert.rejects(migration.migrateUp(options), /up and down/);
		writeFileSync(join(migrationsDir, "alpha.ts"), first);
		writeFileSync(join(migrationsDir, "beta.ts"), second);
		assert.deepEqual((await migration.migrateUp(options)).migrations, [
			"alpha.ts",
		]);
		assert.equal(
			migrationDb.prepare("SELECT count(*) AS n FROM accounts").get()?.n,
			1,
		);
		assert.deepEqual(history(), ["alpha.ts"]);

		writeFileSync(
			join(migrationsDir, "alpha.ts"),
			first.replace("a@b.c", "changed"),
		);
		await assert.rejects(
			migration.migrateLatest(options),
			/hash|changed|modified/i,
		);
		writeFileSync(join(migrationsDir, "alpha.ts"), first);
		renameSync(join(migrationsDir, "alpha.ts"), join(dir, "missing.ts"));
		await assert.rejects(migration.migrateLatest(options), /missing/i);
		renameSync(join(dir, "missing.ts"), join(migrationsDir, "alpha.ts"));
		writeFileSync(join(migrationsDir, "000_earlier.ts"), second);
		await assert.rejects(migration.migrateLatest(options), /before|order/i);
		rmSync(join(migrationsDir, "000_earlier.ts"));

		// Type annotations, comments and formatting do not invalidate applied code.
		writeFileSync(
			join(migrationsDir, "alpha.ts"),
			first
				.replaceAll("db: SqliteMigration", "db: SqliteMigration<{}>")
				.replace("const next", "/* formatting */ const   next"),
		);
		writeFileSync(
			join(migrationsDir, "gamma.ts"),
			`export async function up(db) { await db.raw('CREATE TABLE rolled_back (id INTEGER)'); throw new Error('migration failure'); } export async function down() {}`,
		);
		await assert.rejects(migration.migrateLatest(options), /migration failure/);
		assert.deepEqual(history(), ["alpha.ts", "beta.ts"]);
		assert.equal(
			migrationDb
				.prepare("SELECT name FROM sqlite_master WHERE name = 'rolled_back'")
				.get(),
			undefined,
		);
		writeFileSync(
			join(migrationsDir, "gamma.ts"),
			`export async function up(db) { return db.raw('CREATE TABLE escaped_transaction (id INTEGER); /* end */ COMMIT'); } export async function down() {}`,
		);
		await assert.rejects(migration.migrateLatest(options), /transaction/i);
		assert.equal(
			migrationDb
				.prepare(
					"SELECT name FROM sqlite_master WHERE name = 'escaped_transaction'",
				)
				.get(),
			undefined,
		);
		assert.deepEqual(history(), ["alpha.ts", "beta.ts"]);
		writeFileSync(
			join(migrationsDir, "gamma.ts"),
			`export async function up(db) { await db('CREATE TABLE escaped_count (id INTEGER); COMMIT').executeCount(); return db; } export async function down() {}`,
		);
		await assert.rejects(migration.migrateLatest(options), /transaction/i);
		assert.equal(
			migrationDb
				.prepare("SELECT name FROM sqlite_master WHERE name = 'escaped_count'")
				.get(),
			undefined,
		);
		assert.deepEqual(history(), ["alpha.ts", "beta.ts"]);
		rmSync(join(migrationsDir, "gamma.ts"));
		assert.deepEqual((await migration.migrateLatest(options)).migrations, []);
		assert.deepEqual((await migration.migrateDown(options)).migrations, [
			"beta.ts",
		]);
		assert.deepEqual(
			history(),
			["alpha.ts"],
			"empty down removes its tracking record",
		);
		assert.deepEqual((await migration.migrateDown(options)).migrations, [
			"alpha.ts",
		]);
		assert.deepEqual((await migration.migrateDown(options)).migrations, []);
		assert.equal(
			migrationDb
				.prepare("SELECT name FROM sqlite_master WHERE name = 'accounts'")
				.get(),
			undefined,
		);

		const hash = migration.migrationHash;
		assert.equal(
			hash("export const x: number = 1; // comment"),
			hash("export const x = 1;"),
		);
		assert.notEqual(
			hash("export const x = 'a';"),
			hash('export const x = "a";'),
		);
		assert.notEqual(
			hash("export function x() { return\n1; }"),
			hash("export function x() { return 1; }"),
		);
		assert.notEqual(
			hash("export const x = /a b/;"),
			hash("export const x = /ab/;"),
		);
		assert.notEqual(
			hash("export const x = `a b`;"),
			hash("export const x = `ab`;"),
		);
		assert.equal(
			hash("/** @returns a number */ export function x() { return 1; }"),
			hash("export function x() { return 1; }"),
		);
		assert.equal(
			hash(`export const x = \`a\${1 + 2}b\`;`),
			hash(`export const x = \`a\${1+/* comment */2}b\`;`),
		);
		assert.notEqual(
			hash("export function x() { return/*\n*/1; }"),
			hash("export function x() { return 1; }"),
		);

		// Config paths are relative to the config, while explicit flags use cwd.
		const configDir = join(dir, "project");
		mkdirSync(configDir);
		const config = join(configDir, "typesql.config.ts");
		writeFileSync(
			config,
			`export default { dialect: 'sqlite', db: './app.db', migrationsDir: '../migrations', migrationTable: 'cli_migrations', generate: false } as const;`,
		);
		const run = (...args: string[]) =>
			cli("migrate", ...args, "--config", config);
		assert.match(run("up"), /applied alpha.ts/);
		assert.match(run("latest"), /applied beta.ts/);
		assert.match(run("up"), /no pending migrations/);
		assert.match(run("down"), /reverted beta.ts/);
		assert.match(run("down"), /reverted alpha.ts/);
		assert.match(run("down"), /no applied migrations/);

		// generate reads each migration's schema type; up, down and latest
		// rewrite db.ts beside the config with the last applied one.
		const schemaDir = join(dir, "schema");
		mkdirSync(join(schemaDir, "migrations"), { recursive: true });
		writeFileSync(
			join(schemaDir, "tsconfig.json"),
			JSON.stringify({
				compilerOptions: {
					strict: true,
					module: "nodenext",
					noEmit: true,
					allowImportingTsExtensions: true,
					paths: {
						"@typesql/core/migration": [
							new URL(
								"../packages/core/dist/migration/index.d.ts",
								import.meta.url,
							).pathname,
						],
					},
				},
			}),
		);
		writeFileSync(
			join(schemaDir, "typesql.config.ts"),
			`export default { dialect: 'sqlite', db: './schema.db' } as const;`,
		);
		writeFileSync(
			join(schemaDir, "migrations", "1_posts.ts"),
			`import type { MigrationSchema, SqliteMigration } from '@typesql/core/migration';
export async function up(db: SqliteMigration) {
  return db.add('CREATE TABLE posts (id INTEGER PRIMARY KEY, title TEXT NOT NULL, body TEXT)');
}
export async function down(db: SqliteMigration<MigrationSchema<typeof up>>) { await db.add('DROP TABLE posts'); }
`,
		);
		writeFileSync(
			join(schemaDir, "migrations", "2_views.ts"),
			`import type { MigrationSchema, SqliteMigration } from '@typesql/core/migration';
import type { up as previousUp } from './1_posts.ts';
export async function up(db: SqliteMigration<MigrationSchema<typeof previousUp>>) {
  return db.add('ALTER TABLE posts ADD COLUMN views INTEGER NOT NULL DEFAULT 0');
}
export async function down(db: SqliteMigration<MigrationSchema<typeof up>>) { await db.add('ALTER TABLE posts DROP COLUMN views'); }
`,
		);
		const schemaFile = join(schemaDir, "db.ts");
		const schemaRun = (...args: string[]) =>
			cli("migrate", ...args, "--config", join(schemaDir, "typesql.config.ts"));
		assert.match(
			schemaRun("generate"),
			new RegExp(`^typesql migrate: generated ${schemaFile}$`, "m"),
		);
		const full = readFileSync(schemaFile, "utf8");
		assert.match(full, /from 2_views\.ts/);
		assert.match(full, /import type \{ Col \} from "@typesql\/core\/sqlite";/);
		assert.match(
			full,
			/id: Col<"integer", \{ hasDefault: true; position: 0; rowid: true \}>;[\s\S]*body: Col<"text", \{ nullable: true; position: 2 \}>;[\s\S]*views: Col<"integer", \{ hasDefault: true; position: 3 \}>;/,
		);
		assert.match(schemaRun("up"), /applied 1_posts.ts[\s\S]*generated/);
		assert.doesNotMatch(readFileSync(schemaFile, "utf8"), /views/);
		schemaRun("latest");
		assert.equal(readFileSync(schemaFile, "utf8"), full);
		schemaRun("down");
		assert.match(readFileSync(schemaFile, "utf8"), /from 1_posts\.ts/);
		schemaRun("down");
		assert.match(readFileSync(schemaFile, "utf8"), /export interface DB \{\}/);
		rmSync(schemaFile);
		assert.doesNotMatch(schemaRun("latest", "--no-generate"), /generated/);
		assert.equal(existsSync(schemaFile), false);
		const out = join(schemaDir, "out", "schema.ts");
		schemaRun("generate", "--out", out);
		assert.equal(readFileSync(out, "utf8"), full);

		const generatedDir = join(dir, "generated");
		const make = (...args: string[]) =>
			cli(
				"migrate",
				"make",
				...args,
				"--dialect",
				"sqlite",
				"--dir",
				generatedDir,
			);
		const created = make("create accounts")
			.trim()
			.replace(/^typesql migrate: created /, "");
		assert.match(created, /\d+_create-accounts\.ts$/);
		assert.match(readFileSync(created, "utf8"), /SqliteMigration/);
		const next = make("z add profile")
			.trim()
			.replace(/^typesql migrate: created /, "");
		assert.match(
			readFileSync(next, "utf8"),
			/MigrationSchema<typeof previousUp>/,
		);
		assert.match(
			readFileSync(next, "utf8"),
			/import type \{ up as previousUp \}/,
		);
		const { spawnSync, execFile } = await import("node:child_process");
		const { promisify } = await import("node:util");
		const fail = (status: number, ...args: string[]) => {
			const result = spawnSync(process.execPath, [cliBin, "migrate", ...args], {
				encoding: "utf8",
			});
			assert.equal(result.status, status, result.stdout + result.stderr);
			return result.stderr;
		};
		assert.match(
			fail(2, "make", "--dialect", "sqlite", "--dir", generatedDir),
			/name/i,
		);
		assert.match(
			fail(
				1,
				"make",
				"../escape",
				"--dialect",
				"sqlite",
				"--dir",
				generatedDir,
			),
			/name|separator/i,
		);
		assert.match(
			fail(
				1,
				"generate",
				"--dialect",
				"sqlite",
				"--dir",
				migrationsDir,
				"--out",
				join(dir, "never.ts"),
			),
			/cannot read the schema of beta\.ts/,
		);
		writeFileSync(join(generatedDir, "9999999999_future.ts"), second);
		assert.match(
			fail(1, "make", "earlier", "--dialect", "sqlite", "--dir", generatedDir),
			/sort|before/i,
		);

		const concurrentDir = join(dir, "concurrent");
		mkdirSync(concurrentDir);
		writeFileSync(
			join(concurrentDir, "one.ts"),
			`export async function up(db) { await new Promise(r => setTimeout(r, 50)); return db.add('CREATE TABLE once_only (id INTEGER)'); } export async function down(db) { return db.add('DROP TABLE once_only'); }`,
		);
		writeFileSync(
			join(concurrentDir, "two.ts"),
			`export async function up(db) { await db('INSERT INTO once_only VALUES (1)').execute(); return db; } export async function down() {}`,
		);
		const concurrentDb = join(dir, "concurrent.db");
		const invoke = promisify(execFile);
		const parallelArgs = [
			cliBin,
			"migrate",
			"latest",
			"--dialect",
			"sqlite",
			"--db",
			concurrentDb,
			"--dir",
			concurrentDir,
			"--no-generate",
		];
		await Promise.all([
			invoke(process.execPath, parallelArgs),
			invoke(process.execPath, parallelArgs),
		]);
		const concurrent = new DatabaseSync(concurrentDb);
		try {
			assert.equal(
				concurrent.prepare("SELECT count(*) AS n FROM once_only").get()?.n,
				1,
			);
			assert.equal(
				concurrent.prepare("SELECT count(*) AS n FROM schema_migrations").get()
					?.n,
				2,
			);
		} finally {
			concurrent.close();
		}
	} finally {
		migrationDb.close();
		rmSync(dir, { recursive: true, force: true });
	}
}

// Opt into the same built-package smoke on a disposable PostgreSQL database.
// Two sessions must serialize the whole command, including pending-file discovery.
if (process.env.TYPESQL_MIGRATION_POSTGRES_URL) {
	const migration = (await dist(
		"core/dist/migration/index.js",
	)) as typeof import("../packages/core/src/migration/index.ts");
	const { createRequire } = await import("node:module");
	const { mkdtempSync, rmSync, writeFileSync } = await import("node:fs");
	const { tmpdir } = await import("node:os");
	const { join } = await import("node:path");
	const require = createRequire(
		new URL("../packages/core/package.json", import.meta.url),
	);
	interface PgConnection {
		connect(): Promise<void>;
		end(): Promise<void>;
		query(
			text: string,
			values?: readonly unknown[],
		): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
	}
	const { Client } = require("pg") as {
		Client: new (options: { connectionString: string }) => PgConnection;
	};
	const client = new Client({
		connectionString: process.env.TYPESQL_MIGRATION_POSTGRES_URL,
	});
	const other = new Client({
		connectionString: process.env.TYPESQL_MIGRATION_POSTGRES_URL,
	});
	const dir = mkdtempSync(join(tmpdir(), "typesql-pg-migrations-"));
	writeFileSync(join(dir, "package.json"), '{"type":"module"}\n');
	const schema = `typesql_migration_smoke_${process.pid}`;
	await client.connect();
	await other.connect();
	try {
		await client.query(`CREATE SCHEMA "${schema}"`);
		await client.query(`SET search_path TO "${schema}"`);
		await other.query(`SET search_path TO "${schema}"`);
		writeFileSync(
			join(dir, "alpha.ts"),
			`export async function up(db) { await db('SELECT pg_sleep(0.05)').execute(); return db.add('CREATE TABLE once_only (id integer PRIMARY KEY, note text)'); } export async function down(db) { return db.add('DROP TABLE once_only'); }`,
		);
		writeFileSync(
			join(dir, "beta.ts"),
			`export async function up(db) { await db('INSERT INTO once_only (id, note) VALUES ($1, $2)', 1, null).execute(); await db.raw('SAVEPOINT nested'); await db('INSERT INTO once_only (id) VALUES (2)').execute(); await db.raw('ROLLBACK WORK TO SAVEPOINT nested'); await db.raw('RELEASE SAVEPOINT nested'); return db; } export async function down(db) { await db('DELETE FROM once_only').execute(); }`,
		);
		const options = (connection: PgConnection) => ({
			dialect: "postgres" as const,
			migrationsDir: dir,
			execute: (text: string, values: readonly unknown[]) =>
				connection.query(text, values),
		});
		await assert.rejects(
			migration.migrateLatest({
				...options(client),
				migrationTable: "é".repeat(64),
			}),
			/identifier limit/,
		);
		const results = await Promise.all([
			migration.migrateLatest(options(client)),
			migration.migrateLatest(options(other)),
		]);
		assert.deepEqual(
			results.map((result) => result.migrations.length).sort(),
			[0, 2],
		);
		assert.equal(
			(await client.query("SELECT count(*)::integer AS n FROM once_only"))
				.rows[0]?.n,
			1,
		);
		assert.equal(
			(
				await client.query(
					`SELECT count(*)::integer AS n FROM "${schema}".schema_migrations`,
				)
			).rows[0]?.n,
			2,
		);
		writeFileSync(
			join(dir, "gamma.ts"),
			`export async function up(db) { await db.raw('CREATE TABLE rolled_back (id integer)'); return db.raw('CREATE INDEX CONCURRENTLY bad_index ON once_only (id)'); } export async function down() {}`,
		);
		await assert.rejects(
			migration.migrateLatest(options(client)),
			/transaction|concurrently/i,
		);
		assert.equal(
			(await client.query("SELECT to_regclass('rolled_back') AS name")).rows[0]
				?.name,
			null,
		);
		assert.equal(
			(
				await client.query(
					"SELECT count(*)::integer AS n FROM schema_migrations",
				)
			).rows[0]?.n,
			2,
		);
		writeFileSync(
			join(dir, "gamma.ts"),
			`export async function up(db) { return db.raw('CREATE TABLE escaped_transaction (id integer); /* end */ COMMIT'); } export async function down() {}`,
		);
		await assert.rejects(
			migration.migrateLatest(options(client)),
			/transaction/i,
		);
		assert.equal(
			(await client.query("SELECT to_regclass('escaped_transaction') AS name"))
				.rows[0]?.name,
			null,
		);
		assert.equal(
			(
				await client.query(
					"SELECT count(*)::integer AS n FROM schema_migrations",
				)
			).rows[0]?.n,
			2,
		);
		rmSync(join(dir, "gamma.ts"));
		assert.deepEqual((await migration.migrateDown(options(other))).migrations, [
			"beta.ts",
		]);
		assert.deepEqual(
			(await migration.migrateDown(options(client))).migrations,
			["alpha.ts"],
		);
		assert.deepEqual(
			(await migration.migrateDown(options(client))).migrations,
			[],
		);
	} finally {
		await client
			.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
			.catch(() => undefined);
		await Promise.all([client.end(), other.end()]);
		rmSync(dir, { recursive: true, force: true });
	}
}

console.log("dist smoke test: ok");
