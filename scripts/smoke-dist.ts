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
	sql(`SELECT id FROM users WHERE email = :email ${where}`, {
		email: "a@b.c",
	}),
	{
		text: "SELECT id FROM users WHERE email = $1 AND age > $2",
		values: ["a@b.c", 18],
	},
);
assert.deepEqual(sql(`SELECT ${sql.id("display_name")} FROM users`), {
	text: 'SELECT "display_name" FROM users',
	values: [],
});
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
	`INSERT INTO write_rows ${camelWrites.values("write_rows", [
		{ ...writeModel, jsonData: camelWrites.json(writeModel.jsonData) },
		{
			...writeModel,
			optionalName: undefined,
			jsonData: camelWrites.json(writeModel.jsonData),
		},
	])} RETURNING display_name, optional_name`,
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
	`UPDATE write_rows SET ${camelWrites.set("write_rows", {
		...writeModel,
		optionalName: undefined,
		jsonData: camelWrites.json(writeModel.jsonData),
	})} RETURNING display_name`,
);
assert.equal(
	camelUpdated.text,
	'UPDATE write_rows SET "display_name" = $1, "json_data" = $2 RETURNING display_name',
);
assert.equal(camelUpdated.values[0], "Ada");
assert.equal(JSON.stringify(camelUpdated.values[1]), '{"innerKey":"kept"}');
assert.deepEqual(
	sql(`UPDATE users SET ${sql.set("users", { display_name: "Ada" })}`),
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
	`UPDATE users SET ${cased.set("users", { displayName: "Ada" })} RETURNING display_name`,
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
		`SELECT display_name FROM users WHERE id = $1 ${envelopedWhere}`,
		[7],
	).values,
	[7, 18],
);
assert.deepEqual(
	enveloped.prepare(
		`SELECT display_name FROM users WHERE id = $1 ${envelopedWhere}`,
	)([8]).values,
	[8, 18],
);
assert.deepEqual(
	enveloped(
		`UPDATE users SET ${enveloped.set("users", { data: { displayName: "Grace" } })} WHERE id = $1`,
		[9],
	).values,
	[9, "Grace"],
);
const envelopeInsert = enveloped(
	`INSERT INTO users ${enveloped.values("users", [
		{ data: { id: 1, email: "a@b.c", age: 18, displayName: "Ada" } },
	])}`,
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
			sql.optional(undefined),
			sql.fragment("id > $1", 5),
			sql.optional(includeEmail ? sql.fragment("email = $1", evil) : undefined),
			sql.optional(undefined),
			sql.fragment("age > $1", 18),
			sql.optional(undefined),
		],
		{ separator: " AND " },
	);
	assert.deepEqual(sql(`SELECT id FROM users WHERE ${filters}`), {
		text: includeEmail
			? "SELECT id FROM users WHERE id > $1 AND email = $2 AND age > $3"
			: "SELECT id FROM users WHERE id > $1 AND age > $2",
		values: includeEmail ? [5, evil, 18] : [5, 18],
	});
	const items = [
		sql.optional(undefined),
		sql.fragment("$1", evil),
		sql.optional(undefined),
	];
	assert.deepEqual(sql.combine(items), { text: "$1", values: [evil] });
}
assert.deepEqual(
	sql.combine([
		sql.optional(undefined),
		sql.id("id"),
		sql.optional(undefined),
		sql.id("email"),
	]),
	{
		text: '"id", "email"',
		values: [],
	},
);
for (const includeEmail of [false, true]) {
	const filters = sql.and([
		sql.optional(undefined),
		sql.fragment("id > $1", 5),
		sql.optional(includeEmail ? sql.fragment("email = $1", evil) : undefined),
		sql.or([sql.fragment("age > $1", 18), sql.fragment("age < $1", 3)]),
	]);
	assert.deepEqual(
		sql(`SELECT id FROM users WHERE id <> $1 AND ${filters}`, 0),
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
assert.deepEqual(sql.and([sql.optional(undefined)]), {
	text: "true",
	values: [],
});
assert.deepEqual(sql.or([]), { text: "false", values: [] });
assert.deepEqual(sql.or([sql.optional(undefined), sql.optional(undefined)]), {
	text: "false",
	values: [],
});
assert.deepEqual(sql.and([sql.fragment("id = 1"), sql.or([])]), {
	text: "((id = 1) AND false)",
	values: [],
});
assert.throws(() => {
	// @ts-expect-error undefined must be made explicit with sql.optional().
	sql.and([undefined]);
}, /sql\.and\(\) does not accept null or undefined/);
assert.throws(() => {
	// @ts-expect-error null is not a fragment or the omission sentinel.
	sql.or([null]);
}, /sql\.or\(\) does not accept null or undefined/);
assert.throws(() => sql.combine([]), /needs at least one item/);
assert.throws(
	() => sql.combine([sql.optional(undefined), sql.optional(undefined)]),
	/needs at least one item/,
);
assert.throws(() => {
	// @ts-expect-error undefined must be made explicit with sql.optional().
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

// undefined is the omission; null stays SQL NULL.
assert.equal(sql.optional(null), null);
assert.equal(sql.optional(sql.optional(undefined)), sql.optional(undefined));
const required = sql.fragment("id > $1", 5);
assert.equal(sql.optional(required), required);
assert.throws(() => sql.combine(new Array<typeof required>(1)), /undefined/);
for (const value of [0, false, "", null] as const) {
	assert.deepEqual(sql(`SELECT ${sql.param(value)}`), {
		text: "SELECT $1",
		values: [value],
	});
	assert.equal(sql.optional(value), value);
	assert.deepEqual(sql(`SELECT ${sql.param(sql.optional(value))}`), {
		text: "SELECT $1",
		values: [value],
	});
}
for (const value of [0, 7, null, undefined]) {
	const optionals =
		value === null
			? [value ?? sql.optional(undefined)]
			: [value ?? sql.optional(undefined), sql.optional(value)];
	for (const optional of optionals) {
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
for (const note of ["n", null, undefined] as const) {
	assert.deepEqual(
		sql(`UPDATE preferences SET note = ${sql.param(sql.optional(note))}`),
		note === undefined
			? { text: "UPDATE preferences SET note = DEFAULT", values: [] }
			: { text: "UPDATE preferences SET note = $1", values: [note] },
	);
}
assert.throws(
	() => sql.as("SELECT $1", sql.optional(undefined)),
	/cannot be a bound parameter/,
);
assert.throws(
	() => sql.as("SELECT $1", sql.param(sql.optional(undefined))),
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

// Inline values are checked against a Json<T> column's T and an enum's values.
const prefs = core.createSql<{
	$types: { mood: "happy" | "sad" };
	prefs: {
		mood: Col<"mood">;
		theme: Json<
			{ mode: "dark" | "light"; size?: number },
			{ hasDefault: true }
		>;
	};
}>(corePg.postgres);
assert.equal(
	prefs(
		`UPDATE prefs SET theme = ${prefs.json({ mode: "dark" })}, mood = ${prefs.param("happy")}`,
	).text,
	"UPDATE prefs SET theme = $1, mood = $2",
);
// @ts-expect-error "blue" is not a mode.
prefs(`UPDATE prefs SET theme = ${prefs.json({ mode: "blue" })}`);
// @ts-expect-error size is a number.
prefs(`UPDATE prefs SET theme = ${prefs.param({ mode: "dark", size: "1" })}`);
// @ts-expect-error "angry" is not a mood.
prefs(`UPDATE prefs SET mood = ${prefs.param("angry")}`);

// sql.json(undefined) sends DEFAULT; sql.json(null) binds SQL NULL.
const noTheme: { mode: "dark" } | undefined = undefined;
assert.deepEqual(
	prefs(
		`INSERT INTO prefs (mood, theme) VALUES ('sad', ${prefs.json(noTheme)})`,
	),
	{
		text: "INSERT INTO prefs (mood, theme) VALUES ('sad', DEFAULT)",
		values: [],
	},
);
assert.deepEqual(prefs.as(`SELECT ${prefs.json(null)}::jsonb AS j`).values, [
	null,
]);
assert.deepEqual(
	prefs(
		`INSERT INTO prefs ${prefs.values("prefs", [
			{ mood: "sad", theme: prefs.json(noTheme) },
			{ mood: "happy", theme: prefs.json({ mode: "dark" }) },
		])}`,
	).text,
	'INSERT INTO prefs ("mood", "theme") VALUES ($1, DEFAULT), ($2, $3)',
);
assert.equal(
	prefs(
		`UPDATE prefs SET ${prefs.set("prefs", { mood: "sad", theme: prefs.json(noTheme) })}`,
	).text,
	'UPDATE prefs SET "mood" = $1',
);
assert.throws(
	() => prefs.as("SELECT $1", prefs.json(undefined)),
	/must be interpolated inline/,
);

// Inline rewriting keeps explicit offsets, repeated tokens and DEFAULT values.
const repeated = sql.param("repeat");
assert.deepEqual(
	sql.as(
		`SELECT $2, ${repeated}, ${repeated}, ${sql.param(sql.optional(undefined))}, '$99', "$88" -- $77\n`,
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
assert.deepEqual(sql.as(`SELECT $2, ${piece}, ${piece}`, 1, 2), {
	text: "SELECT $2, $3, '$99', $$ $88 $$, $4, '$99', $$ $88 $$",
	values: [1, 2, 3, 3],
});
// A `$` without digits (regex anchors, dollar quotes) survives renumbering in the types too.
const anchored = sql.fragment(
	"(SELECT u.id FROM users u WHERE u.email ~ '^a$' AND u.age = $1 AND u.display_name <> $tag$ $1 $tag$ ORDER BY substring(u.display_name FROM '[0-9]+$')::int LIMIT 1) AS x",
	30,
);
assert.deepEqual(
	sql(`SELECT ${anchored} FROM users WHERE id = ${sql.param(7)}`),
	{
		text: "SELECT (SELECT u.id FROM users u WHERE u.email ~ '^a$' AND u.age = $2 AND u.display_name <> $tag$ $1 $tag$ ORDER BY substring(u.display_name FROM '[0-9]+$')::int LIMIT 1) AS x FROM users WHERE id = $1",
		values: [7, 30],
	},
);

// Interpolated fragments splice in place, after the statement's own values.
const shown = sql.id("email");
const adult = sql.fragment("age > $1", 18);
assert.deepEqual(
	sql(
		`SELECT ${shown} FROM users WHERE ${sql.and([adult, sql.fragment("id < $1", 9)])} ${sql.fragment("AND id > $1", 1)} AND email <> :e AND id <> ${sql.param(3)}`,
		{ e: "x" },
	),
	{
		text: 'SELECT "email" FROM users WHERE ((age > $3) AND (id < $4)) AND id > $5 AND email <> $1 AND id <> $2',
		values: ["x", 3, 18, 9, 1],
	},
);
const nested = sql.fragment(`AND ${shown} = $1`, "a@b.c");
assert.deepEqual(sql(`SELECT id FROM users WHERE ${adult} ${nested}`), {
	text: 'SELECT id FROM users WHERE age > $1 AND "email" = $2',
	values: [18, "a@b.c"],
});
const findShown = sql.prepare(`SELECT ${shown} FROM users WHERE id = $1`);
assert.deepEqual(findShown(4), {
	text: 'SELECT "email" FROM users WHERE id = $1',
	values: [4],
});
for (const [open, close] of [
	["'", "'"],
	['"', '"'],
	["$$", "$$"],
	["/*", "*/"],
	["--", "\n"],
]) {
	assert.throws(
		() => sql.as(`SELECT ${open}${shown}${close}`),
		/cannot be interpolated inside/,
	);
}
const adults = sql(`SELECT id FROM users WHERE ${adult}`);
const adultEmails = sql(`SELECT ${shown} FROM users WHERE id IN (${adults})`);
assert.deepEqual(
	sql(
		`SELECT id FROM users WHERE email IN (${adultEmails}) AND id <> $1 ${sql.fragment("")}`,
		2,
	),
	{
		text: 'SELECT id FROM users WHERE email IN (SELECT "email" FROM users WHERE id IN (SELECT id FROM users WHERE age > $2)) AND id <> $1 ',
		values: [2, 18],
	},
);
assert.throws(
	() => sql.as("SELECT id FROM users WHERE id = $1", adults),
	/not a parameter value/,
);
// Without a table, sql.set and sql.values take the target of the statement.
assert.deepEqual(
	sql(
		`INSERT INTO preferences ${sql.values([{ email: "a@b.c" }, { email: "d@e.f", retries: 2 }])} RETURNING email`,
	),
	{
		text: 'INSERT INTO preferences ("email", "retries") VALUES ($1, DEFAULT), ($2, $3) RETURNING email',
		values: ["a@b.c", "d@e.f", 2],
	},
);
assert.deepEqual(
	sql(
		`UPDATE preferences SET ${sql.set({ note: null, retries: undefined })} WHERE email = $1`,
		"a@b.c",
	),
	{
		text: 'UPDATE preferences SET "note" = $2 WHERE email = $1',
		values: ["a@b.c", null],
	},
);
// An omitted optional fragment splices nothing.
for (const more of [sql.fragment("AND id > $1", 1), undefined]) {
	assert.deepEqual(
		sql(`SELECT id FROM users WHERE id < $1 ${sql.optional(more)}`, 9),
		more
			? {
					text: "SELECT id FROM users WHERE id < $1 AND id > $2",
					values: [9, 1],
				}
			: { text: "SELECT id FROM users WHERE id < $1 ", values: [9] },
	);
}
// sql.if gives the fragment for a truthy value, and the omission otherwise.
for (const search of ["a%", "", undefined] as const) {
	assert.deepEqual(
		sql(
			`SELECT id FROM users WHERE id < $1 ${sql.if(search, (s) => sql.fragment(`AND email LIKE ${sql.param(s)}`))}`,
			9,
		),
		search
			? {
					text: "SELECT id FROM users WHERE id < $1 AND email LIKE $2",
					values: [9, search],
				}
			: { text: "SELECT id FROM users WHERE id < $1 ", values: [9] },
	);
}
assert.deepEqual(
	sql.and([
		sql.if(0, () => sql.fragment("false")),
		sql.if(7, (n) => sql.fragment("id = $1", n)),
	]),
	{ text: "(id = $1)", values: [7] },
);
// A {name} in the SQL is plain text now, not a slot.
assert.deepEqual(sql.as("SELECT '{a}', {b}"), {
	text: "SELECT '{a}', {b}",
	values: [],
});
const once = `SELECT ${shown} FROM users`;
sql.as(once);
assert.throws(() => sql.as(once), /already used/);
assert.throws(
	() => sql.as("SELECT id FROM users WHERE email = $1", shown),
	/not a parameter value/,
);
assert.throws(() => sql.param(shown as never), /not a fragment/);

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
const noteInsert = notes(
	`INSERT INTO notes ${notes.values("notes", [{ extra_data: notes.json(note.extra_data) }])} RETURNING *`,
);
assert.equal(
	noteInsert.text,
	'INSERT INTO notes ("extra_data") VALUES ($1) RETURNING *',
);
assert.equal(JSON.stringify(noteInsert.values[0]), '{"tags":["a",["b"]]}');

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

for (const name of ["createSql", "NoResultError"] as const) {
	assert.equal(typeof core[name], "function", `@typesql/core export ${name}`);
}
for (const [entry, names] of [
	[core, ["Migrations", "runMigrations"]],
	[corePg, ["migrations"]],
	[coreSqlite, ["migrations"]],
	[pg, ["migrate"]],
	[pgjs, ["migrate"]],
	[sqliteAdapter, ["migrate"]],
] as const)
	for (const name of names)
		assert.ok(!(name in entry), `4.0 removed the export ${name}`);
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
	custom(`SELECT id FROM users WHERE age > $1 AND id IN (${inner})`, 2),
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
	for (const name of ["createSql", "executor"]) {
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
		`INSERT INTO plugin_rows ${sqlitePlugins.values("plugin_rows", [
			{
				data: {
					userId: 1,
					displayName: null,
					jsonData: '{"inner_key":"kept"}',
				},
			},
		])} RETURNING user_id, display_name, json_data`,
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
			`UPDATE plugin_rows SET ${tx.set("plugin_rows", { data: { displayName: "Ada" } })} WHERE user_id = $1`,
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
for (const name of ["createSql", "executor"])
	assert.equal(
		typeof sqliteAdapter[name],
		"function",
		`@typesql/sqlite export ${name}`,
	);
db.exec(
	"CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT NOT NULL, meta TEXT)",
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
	/^Usage: typesql migrate <latest\|up\|down\|status\|make name\|generate>/,
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

// Exercise the published migration entry point against SQLite databases.
{
	const { createMigrator, isMigrator, migration } = (await dist(
		"core/dist/migration/index.js",
	)) as typeof import("../packages/core/src/migration/index.ts");
	type Migrator = import("../packages/core/src/migration/index.ts").Migrator;
	type SQLInputValue = import("node:sqlite").SQLInputValue;
	const {
		existsSync,
		mkdirSync,
		mkdtempSync,
		readFileSync,
		rmSync,
		symlinkSync,
		writeFileSync,
	} = await import("node:fs");
	const { createRequire } = await import("node:module");
	const { tmpdir } = await import("node:os");
	const { basename, join } = await import("node:path");
	const { pathToFileURL } = await import("node:url");
	const { spawnSync, execFile } = await import("node:child_process");
	const { promisify } = await import("node:util");
	const dir = mkdtempSync(join(tmpdir(), "typesql-migrations-"));
	/** A project whose files import @typesql/core, as an installed one does. */
	const project = (name: string): string => {
		const root = join(dir, name);
		mkdirSync(join(root, "node_modules", "@typesql"), { recursive: true });
		symlinkSync(
			new URL("../packages/core", import.meta.url).pathname,
			join(root, "node_modules", "@typesql", "core"),
		);
		writeFileSync(join(root, "package.json"), '{"type":"module"}\n');
		writeFileSync(
			join(root, "tsconfig.json"),
			JSON.stringify({
				compilerOptions: {
					strict: true,
					module: "nodenext",
					noEmit: true,
					skipLibCheck: true,
					types: [],
				},
			}),
		);
		return root;
	};
	/** An executor on one node:sqlite database, as a caller passes with `execute`. */
	const executor = (
		database: InstanceType<typeof DatabaseSync>,
		log?: string[],
	) =>
		Object.assign(
			async (text: string, values: readonly unknown[]) => {
				log?.push(text);
				const query = positional(text, values);
				return database
					.prepare(query.text)
					.all(...(query.values as SQLInputValue[]));
			},
			{
				count: async (text: string, values: readonly unknown[]) => {
					log?.push(text);
					const query = positional(text, values);
					return Number(
						database
							.prepare(query.text)
							.run(...(query.values as SQLInputValue[])).changes,
					);
				},
			},
		);
	const fail = (status: number, ...args: string[]) => {
		const result = spawnSync(process.execPath, [cliBin, "migrate", ...args], {
			encoding: "utf8",
		});
		assert.equal(result.status, status, result.stdout + result.stderr);
		return result.stderr;
	};
	const created = (output: string) =>
		output.trim().replace(/^typesql migrate: created /, "");
	const memory = new DatabaseSync(":memory:");
	const exists = (
		database: InstanceType<typeof DatabaseSync>,
		name: string,
	): boolean =>
		database
			.prepare("SELECT name FROM sqlite_master WHERE name = ?")
			.get(name) !== undefined;
	try {
		// Array mode with the caller's connection.
		const accounts = migration("sqlite", {
			up: async (db) => {
				const next = await db.add(
					"CREATE TABLE accounts (id INTEGER PRIMARY KEY, email TEXT NOT NULL, note TEXT)",
				);
				// The dry run's queries change no rows: it ends here.
				const inserted = await next(
					"INSERT INTO accounts (email, note) VALUES ($1, $2)",
					"a@b.c",
					null,
				).executeCount();
				if (inserted !== 1)
					throw new Error("the migration's db lost its count callback");
				await next.raw("SAVEPOINT nested");
				await next(
					"INSERT INTO accounts (email) VALUES ($1)",
					"rolled-back",
				).execute();
				await next.raw("ROLLBACK TRANSACTION TO SAVEPOINT nested");
				await next.raw("RELEASE SAVEPOINT nested");
				return next;
			},
			down: async (db) => {
				await db.add("DROP TABLE accounts");
			},
		});
		type Accounts = Awaited<ReturnType<typeof accounts.up>>;
		// A raw step whose SQL is built at runtime, a branch only real rows
		// take, and executeTakeFirstOrThrow, which ends the dry run: none of
		// them changes the fingerprint between runs.
		const profile = (from: { readonly up: (db: never) => Promise<Accounts> }) =>
			migration(from, {
				up: async (db) => {
					const next = await db.add("ALTER TABLE accounts ADD COLUMN bio TEXT");
					await next.raw(
						`UPDATE accounts SET note = 'migrated at ${Date.now()}'`,
					);
					const rows = await next("SELECT id FROM accounts").execute();
					if (rows.length > 0)
						await next.add("CREATE INDEX accounts_bio ON accounts (bio)");
					const first = await next(
						"SELECT email FROM accounts ORDER BY id",
					).executeTakeFirstOrThrow();
					await next("UPDATE accounts SET bio = $1", first.email).execute();
					return next;
				},
				down: async (db) => {
					await db.raw("DROP INDEX IF EXISTS accounts_bio");
					await db.add("ALTER TABLE accounts DROP COLUMN bio");
				},
			});
		const second = profile(accounts);
		const history = () =>
			memory
				.prepare(
					'SELECT name, hash FROM "tracked""migrations" ORDER BY applied_at, name',
				)
				.all() as { name: string; hash: string }[];
		const one = createMigrator({
			dialect: "sqlite",
			execute: executor(memory),
			migrationTable: 'tracked"migrations',
			migrations: [accounts],
		});
		assert.ok(isMigrator(one));
		assert.ok(!isMigrator({ ...one }));
		assert.deepEqual(await one.down(), { reverted: [] });
		assert.equal(
			exists(memory, 'tracked"migrations'),
			false,
			"an empty command does not create its history table",
		);
		assert.deepEqual(await one.up(), { applied: ["0001"] });
		assert.equal(
			memory.prepare("SELECT count(*) AS n FROM accounts").get()?.n,
			1,
		);
		const both = one.with({ migrations: [accounts, second] });
		const [firstStatus, secondStatus] = await both.status();
		assert.equal(firstStatus?.name, "0001");
		assert.ok(firstStatus?.appliedAt instanceof Date);
		assert.deepEqual(secondStatus, {
			name: "0002",
			applied: false,
			appliedAt: null,
		});
		assert.deepEqual(await both.latest(), { applied: ["0002"] });
		assert.equal(exists(memory, "accounts_bio"), true);
		assert.deepEqual(await both.latest(), { applied: [] });
		assert.match(history()[0]?.hash ?? "", /^v4:[0-9a-f]{64}$/);

		// Reformatting a DDL string is not a change; editing it is.
		const reformatted = migration("sqlite", {
			up: async (db) =>
				db.add(`create table accounts (
					id integer primary key, -- the key
					email text not null,
					note   text
				)`),
			down: async (db) => {
				await db.add("DROP TABLE accounts");
			},
		});
		assert.deepEqual(
			(
				await both
					.with({ migrations: [reformatted, profile(reformatted)] })
					.status()
			).map((entry) => entry.applied),
			[true, true],
		);
		const edited = migration("sqlite", {
			up: async (db) =>
				db.add(
					"CREATE TABLE accounts (id INTEGER PRIMARY KEY, email TEXT, note TEXT)",
				),
			down: async (db) => {
				await db.add("DROP TABLE accounts");
			},
		});
		await assert.rejects(
			both.with({ migrations: [edited, profile(edited as never)] }).status(),
			/applied migration 1 \(0001\) has changed/,
		);
		// An inserted migration: the fingerprints catch it, and so does the
		// chain check when the next one still starts from the old one.
		const inserted = migration(reformatted, {
			up: async (db) => {
				await db.raw("SELECT 1");
				return db;
			},
			down: async () => {},
		});
		await assert.rejects(
			both
				.with({ migrations: [reformatted, inserted, profile(inserted)] })
				.status(),
			/applied migration 2 \(0002\) has changed/,
		);
		await assert.rejects(
			both.with({ migrations: [accounts, inserted, second] }).status(),
			/migration 2 \(0002\) starts from a migration that isn't in the list/,
		);
		await assert.rejects(
			both.with({ migrations: [accounts, profile(reformatted)] }).status(),
			/migration 2 \(0002\) starts from a migration that isn't in the list/,
		);
		// A reordered array fails the chain check before the database is read.
		const notes = migration(second, {
			up: async (db) =>
				db.add("CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT)"),
			down: async (db) => {
				await db.add("DROP TABLE notes");
			},
		});
		await assert.rejects(
			both.with({ migrations: [second, accounts] }).status(),
			/migration 1 \(0001\) starts from another migration, but it is the first one/,
		);
		await assert.rejects(
			both.with({ migrations: [accounts, notes, second] }).status(),
			/migration 2 \(0002\) starts from migration 3 \(0003\), not from migration 1 \(0001\)/,
		);

		// Each migration runs in a transaction; it can't end it.
		const failing = (step: (db: Accounts) => Promise<unknown>) =>
			both.with({
				migrations: [
					accounts,
					second,
					migration(second, {
						up: async (db) => {
							await step(db as never);
							return db;
						},
						down: async () => {},
					}),
				],
			});
		await assert.rejects(
			failing(async (db) => {
				await db.raw("CREATE TABLE rolled_back (id INTEGER)");
				throw new Error("migration failure");
			}).latest(),
			/migration failure/,
		);
		assert.equal(exists(memory, "rolled_back"), false);
		await assert.rejects(
			failing((db) =>
				db.raw(
					"CREATE TABLE escaped_transaction (id INTEGER); /* end */ COMMIT",
				),
			).latest(),
			/transaction/,
		);
		await assert.rejects(
			failing((db) =>
				(db as unknown as (text: string) => LiteQuery)(
					"CREATE TABLE escaped_count (id INTEGER); COMMIT",
				).executeCount(),
			).latest(),
			/transaction/,
		);
		assert.equal(exists(memory, "escaped_transaction"), false);
		assert.equal(exists(memory, "escaped_count"), false);
		assert.deepEqual(
			history().map((row) => row.name),
			["0001", "0002"],
		);
		assert.deepEqual(await both.down(), { reverted: ["0002"] });
		assert.equal(exists(memory, "accounts_bio"), false);
		assert.deepEqual(await both.down(), { reverted: ["0001"] });
		assert.deepEqual(await both.down(), { reverted: [] });
		assert.equal(exists(memory, "accounts"), false);

		// transaction: false (Cloudflare D1) sends no BEGIN, COMMIT or ROLLBACK.
		const statements: string[] = [];
		const d1 = createMigrator({
			dialect: "sqlite",
			execute: executor(memory, statements),
			transaction: false,
			migrations: [accounts, second],
		});
		assert.deepEqual(await d1.latest(), { applied: ["0001", "0002"] });
		assert.deepEqual(await d1.down(), { reverted: ["0002"] });
		assert.ok(
			!statements.some((text) =>
				/^\s*(?:BEGIN|COMMIT|ROLLBACK\s*$)/i.test(text),
			),
			statements.join("\n"),
		);

		// A dry run that waits for rows times out before the database is touched.
		const waiting = migration("sqlite", {
			up: async (db) => {
				for (;;) {
					const rows = await db("SELECT 1 AS one").execute();
					if (rows.length > 0) return db;
					await new Promise((resolve) => setTimeout(resolve, 50));
				}
			},
			down: async () => {},
		});
		const untouched = new DatabaseSync(":memory:");
		await assert.rejects(
			createMigrator({
				dialect: "sqlite",
				execute: executor(untouched),
				migrations: [waiting],
			}).latest(),
			/migration 1 \(0001\) ran longer than 5 seconds/,
		);
		assert.equal(
			untouched.prepare("SELECT count(*) AS n FROM sqlite_master").get()?.n,
			0,
		);
		untouched.close();

		assert.throws(
			() => createMigrator({ dialect: "sqlite", db: "x.db" }),
			/set migrationsDir .* or migrations/,
		);
		assert.throws(
			() =>
				createMigrator({
					dialect: "sqlite",
					migrations: [],
					migrationsDir: "migrations",
				}),
			/not both/,
		);
		assert.throws(
			() => createMigrator({ dialect: "postgres", db: "x.db", migrations: [] }),
			/use url for PostgreSQL/,
		);
		await assert.rejects(
			createMigrator({ dialect: "sqlite", migrations: [] }).status(),
			/set db \(or execute\)/,
		);
		await assert.rejects(
			createMigrator({ dialect: "sqlite", migrations: [] }).make("x"),
			/make\(\) works with migrationsDir/,
		);

		// Array mode and the adapter helpers load no Node built-ins, as in
		// Workers, Bun and Deno.
		const isolated = join(dir, "isolated.mjs");
		writeFileSync(
			isolated,
			`import { builtinModules, registerHooks } from "node:module";
const { DatabaseSync } = process.getBuiltinModule("node:sqlite");
registerHooks({
	resolve(specifier, context, nextResolve) {
		if (specifier.startsWith("node:") || builtinModules.includes(specifier))
			throw new Error("loaded " + specifier);
		return nextResolve(specifier, context);
	},
});
const { createMigrator, migration } = await import(${JSON.stringify(new URL("../packages/core/dist/migration/index.js", import.meta.url).href)});
const { positional } = await import(${JSON.stringify(new URL("../packages/core/dist/adapter.js", import.meta.url).href)});
const database = new DatabaseSync(":memory:");
// As for Cloudflare D1, which binds ?NNN but not $1.
const execute = async (text, values) => {
	const query = positional(text, values);
	return database.prepare(query.text).all(...query.values);
};
const first = migration("sqlite", {
	up: async (db) => db.add("CREATE TABLE t (id INTEGER PRIMARY KEY)"),
	down: async (db) => { await db.add("DROP TABLE t"); },
});
const second = migration(first, {
	up: async (db) => db.add("ALTER TABLE t ADD COLUMN name TEXT"),
	down: async (db) => { await db.add("ALTER TABLE t DROP COLUMN name"); },
});
const migrator = createMigrator({ dialect: "sqlite", execute, migrations: [first, second] });
const { applied } = await migrator.latest();
const status = await migrator.status();
console.log(JSON.stringify({ applied, status: status.map((entry) => entry.applied) }));
`,
		);
		const isolatedRun = spawnSync(process.execPath, [isolated], {
			encoding: "utf8",
		});
		assert.equal(isolatedRun.status, 0, isolatedRun.stderr);
		assert.deepEqual(JSON.parse(isolatedRun.stdout), {
			applied: ["0001", "0002"],
			status: [true, true],
		});

		// A long array history type-checks cold and with a wrong column still
		// reported, in one file, and runs.
		const long = project("long");
		const length = 300;
		const table = (i: number) =>
			`{ up: async (db) => db.add("CREATE TABLE t${i} (id INTEGER PRIMARY KEY, v TEXT)"), down: async (db) => { await db.add("DROP TABLE t${i}"); } }`;
		writeFileSync(
			join(long, "migrations.ts"),
			[
				'import { createMigrator, migration } from "@typesql/core/migration";',
				`const m1 = migration("sqlite", ${table(1)});`,
				...Array.from(
					{ length: length - 1 },
					(_, i) => `const m${i + 2} = migration(m${i + 1}, ${table(i + 2)});`,
				),
				`export const last = m${length};`,
				`export const migrator = createMigrator({ dialect: "sqlite", db: ":memory:", migrations: [${Array.from({ length }, (_, i) => `m${i + 1}`).join(", ")}] });`,
				"",
			].join("\n"),
		);
		writeFileSync(
			join(long, "check.ts"),
			`import { migration, type SchemaOf } from "@typesql/core/migration";
import { last } from "./migrations.js";
export const next = migration(last, {
	up: async (db) => {
		await db("SELECT t1.v, t${length}.v FROM t1, t${length}").execute();
		await db("SELECT nope FROM t${length}").execute();
		return db;
	},
	down: async () => {},
});
export const column: keyof SchemaOf<typeof last>["t${length}"] = "v";
`,
		);
		{
			const { API } = createRequire(import.meta.url)("typescript/sync");
			const api = new API({ cwd: long });
			try {
				const check = join(long, "check.ts");
				const program = api
					.createSnapshot({ openFiles: [check] })
					.getDefaultProjectForFile(check).program;
				const codes = (file: string) =>
					program
						.getSemanticDiagnostics(file)
						.map((d: { code: number }) => d.code);
				assert.deepEqual(codes(check), [2345]);
				assert.deepEqual(codes(join(long, "migrations.ts")), []);
			} finally {
				api.close();
			}
		}
		const longHistory = (await import(
			pathToFileURL(join(long, "migrations.ts")).href
		)) as { migrator: Migrator };
		assert.equal((await longHistory.migrator.latest()).applied.length, length);

		// Directory mode through the CLI, with the config's migrator.
		const app = project("app");
		const config = join(app, "typesql.config.ts");
		writeFileSync(
			config,
			`import { createMigrator } from "@typesql/core/migration";
export default createMigrator({ dialect: "sqlite", db: "./app.db", migrationsDir: "./migrations", migrationTable: "cli_migrations" });
`,
		);
		const run = (...args: string[]) =>
			cli("migrate", ...args, "--config", config);
		const usersFile = created(run("make", "create users"));
		assert.match(usersFile, /\d+_create-users\.ts$/);
		assert.match(
			readFileSync(usersFile, "utf8"),
			/^import \{ migration \} from "@typesql\/core\/migration";\n\nexport default migration\("sqlite", \{\n\tup: async \(db\) => \{\n\t\treturn db;/,
		);
		const profileFile = created(run("make", "profile"));
		assert.match(
			readFileSync(profileFile, "utf8"),
			new RegExp(
				`import previous from "\\./${basename(usersFile, ".ts")}\\.js";\n\nexport default migration\\(previous, \\{`,
			),
		);
		const users =
			"CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT NOT NULL)";
		const bio = "ALTER TABLE users ADD COLUMN bio TEXT";
		writeFileSync(
			usersFile,
			`import { migration } from "@typesql/core/migration";

export default migration("sqlite", {
	up: async (db) => db.add("${users}"),
	down: async (db) => {
		await db.add("DROP TABLE users");
	},
});
`,
		);
		writeFileSync(
			profileFile,
			`import { migration } from "@typesql/core/migration";
import previous from "./${basename(usersFile, ".ts")}.js";

export default migration(previous, {
	up: async (db) => {
		const next = await db.add("${bio}");
		await next("SELECT id, email, bio FROM users").execute();
		return next;
	},
	down: async (db) => {
		await db.add("ALTER TABLE users DROP COLUMN bio");
	},
});
`,
		);
		const schemaFile = join(app, "db.ts");
		const schema = () => readFileSync(schemaFile, "utf8");
		assert.match(
			run("status"),
			/^pending +\d+_create-users\.ts\npending +\d+_profile\.ts\n$/,
		);
		assert.match(
			run("up"),
			new RegExp(
				`applied \\d+_create-users\\.ts\ntypesql migrate: generated ${schemaFile}\n$`,
			),
		);
		assert.doesNotMatch(schema(), /bio/);
		assert.match(run("latest"), /applied \d+_profile\.ts/);
		const full = schema();
		assert.match(full, /from \d+_profile\.ts\. Do not edit\./);
		assert.match(
			full,
			/id: Col<"integer", \{ hasDefault: true; position: 0; rowid: true \}>;\n\t\temail: Col<"text", \{ position: 1 \}>;\n\t\tbio: Col<"text", \{ nullable: true; position: 2 \}>;/,
		);
		assert.match(
			run("status"),
			/^applied {2}\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z {2}\d+_create-users\.ts\napplied .*_profile\.ts\n$/,
		);
		assert.match(run("up"), /no pending migrations/);
		const inProcess = createMigrator({
			dialect: "sqlite",
			db: join(app, "app.db"),
			migrationsDir: join(app, "migrations"),
			migrationTable: "cli_migrations",
			generate: false,
		});
		assert.deepEqual(
			(await inProcess.status()).map((entry) => entry.applied),
			[true, true],
		);
		// Reformatting an applied file's DDL is not a change; editing it is.
		const source = readFileSync(usersFile, "utf8");
		writeFileSync(
			usersFile,
			source.replace(
				`"${users}"`,
				"`create table users (\n\t\tid integer primary key, -- the key\n\t\temail text not null\n\t)`",
			),
		);
		assert.match(run("status"), /^applied .*\napplied /);
		writeFileSync(usersFile, source.replace("NOT NULL", ""));
		assert.match(
			fail(1, "status", "--config", config),
			/applied migration 1 \(\d+_create-users\.ts\) has changed/,
		);
		writeFileSync(usersFile, source);
		assert.match(run("down"), /reverted \d+_profile\.ts/);
		assert.match(schema(), /from \d+_create-users\.ts/);
		assert.match(run("down"), /reverted \d+_create-users\.ts/);
		assert.match(schema(), /export interface DB \{\}/);
		assert.match(run("down"), /no applied migrations/);
		rmSync(schemaFile);
		assert.doesNotMatch(run("latest", "--no-generate"), /generated/);
		assert.equal(existsSync(schemaFile), false);
		assert.match(run("generate"), /generated/);
		assert.equal(schema(), full);
		const out = join(app, "out", "schema.ts");
		run("generate", "--out", out);
		assert.equal(readFileSync(out, "utf8"), full);

		// The same history from an array with the same steps, and back.
		const appUsers = migration("sqlite", {
			up: async (db) => db.add(users),
			down: async (db) => {
				await db.add("DROP TABLE users");
			},
		});
		const appProfile = migration(appUsers, {
			up: async (db) => db.add(bio),
			down: async (db) => {
				await db.add("ALTER TABLE users DROP COLUMN bio");
			},
		});
		const appPosts = migration(appProfile, {
			up: async (db) =>
				db.add("CREATE TABLE posts (id INTEGER PRIMARY KEY, title TEXT)"),
			down: async (db) => {
				await db.add("DROP TABLE posts");
			},
		});
		const appArray = createMigrator({
			dialect: "sqlite",
			db: join(app, "app.db"),
			migrationTable: "cli_migrations",
			migrations: [appUsers, appProfile, appPosts],
		});
		assert.deepEqual(
			(await appArray.status()).map((entry) => [entry.name, entry.applied]),
			[
				[basename(usersFile), true],
				[basename(profileFile), true],
				["0003", false],
			],
		);
		assert.deepEqual(await appArray.latest(), { applied: ["0003"] });
		writeFileSync(
			join(app, "migrations", "9999999999_posts.ts"),
			`import { migration } from "@typesql/core/migration";
import previous from "./${basename(profileFile, ".ts")}.js";

export default migration(previous, {
	up: async (db) => db.add("CREATE TABLE posts (id INTEGER PRIMARY KEY, title TEXT)"),
	down: async (db) => {
		await db.add("DROP TABLE posts");
	},
});
`,
		);
		assert.match(run("status"), /\napplied .* 0003\n$/);
		assert.match(run("down"), /reverted 0003/);
		assert.match(run("latest"), /applied 9999999999_posts\.ts/);
		assert.match(schema(), /posts: \{/);

		// CLI flags override the config through .with(), relative to the
		// working directory; an empty database has everything pending.
		const otherDb = join(dir, "other.db");
		assert.match(
			run("status", "--db", otherDb),
			/^pending .*\npending .*\npending .*\n$/,
		);
		assert.match(
			run("latest", "--db", otherDb, "--no-generate"),
			/applied 9999999999_posts\.ts\n$/,
		);
		assert.match(run("status"), /^applied .*\napplied .*\napplied .*\n$/);
		assert.match(
			fail(1, "status", "--config", config, "--dialect", "postgres"),
			/db opens a SQLite file; use url for PostgreSQL/,
		);
		const notMigrator = join(dir, "plain.config.ts");
		writeFileSync(
			notMigrator,
			"export default { dialect: 'sqlite', db: './app.db' };\n",
		);
		assert.match(
			fail(1, "status", "--config", notMigrator),
			/must default-export a migrator: export default createMigrator/,
		);
		assert.match(
			fail(1, "status", "--dir", join(app, "migrations")),
			/pass --dialect postgres or sqlite/,
		);

		// A 3.x history and 3.x files carry over: the source hashes become
		// fingerprints, and a new file starts from the last 3.x file's up.
		const legacy = project("legacy");
		const legacyDir = join(legacy, "migrations");
		mkdirSync(legacyDir);
		writeFileSync(
			join(legacyDir, "0001_posts.ts"),
			`import type { SchemaOf, SqliteMigration } from "@typesql/core/migration";
export async function up(db: SqliteMigration) {
	return db.add("CREATE TABLE posts (id INTEGER PRIMARY KEY, title TEXT NOT NULL)");
}
export async function down(db: SqliteMigration<SchemaOf<typeof up>>) {
	await db.add("DROP TABLE posts");
}
`,
		);
		writeFileSync(
			join(legacyDir, "0002_views.ts"),
			`import type { SchemaOf, SqliteMigration } from "@typesql/core/migration";
import type { up as previousUp } from "./0001_posts.js";
export async function up(db: SqliteMigration<SchemaOf<typeof previousUp>>) {
	return db.add("ALTER TABLE posts ADD COLUMN views INTEGER NOT NULL DEFAULT 0");
}
export async function down(db: SqliteMigration<SchemaOf<typeof up>>) {
	await db.add("ALTER TABLE posts DROP COLUMN views");
}
`,
		);
		const legacyFile = join(legacy, "app.db");
		const legacyDb = new DatabaseSync(legacyFile);
		legacyDb.exec(`CREATE TABLE schema_migrations (name TEXT PRIMARY KEY NOT NULL, hash TEXT NOT NULL, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE posts (id INTEGER PRIMARY KEY, title TEXT NOT NULL);
ALTER TABLE posts ADD COLUMN views INTEGER NOT NULL DEFAULT 0;
INSERT INTO schema_migrations (name, hash) VALUES ('0001_posts.ts', '${"a".repeat(64)}'), ('0002_views.ts', '${"b".repeat(64)}');`);
		const legacyRun = (...args: string[]) =>
			cli(
				"migrate",
				...args,
				"--dialect",
				"sqlite",
				"--db",
				legacyFile,
				"--dir",
				legacyDir,
				"--out",
				join(legacy, "db.ts"),
			);
		assert.match(
			legacyRun("status"),
			/^applied .* 0001_posts\.ts\napplied .* 0002_views\.ts\n$/,
		);
		assert.deepEqual(
			legacyDb
				.prepare("SELECT hash FROM schema_migrations ORDER BY name")
				.all()
				.map((row) => /^v4:/.test(String(row.hash))),
			[true, true],
		);
		const tags = created(legacyRun("make", "tags"));
		assert.match(
			readFileSync(tags, "utf8"),
			/import \{ up as previous \} from "\.\/0002_views\.js";\n\nexport default migration\(previous, \{/,
		);
		writeFileSync(
			tags,
			readFileSync(tags, "utf8").replace(
				"return db;",
				'return db.add("ALTER TABLE posts ADD COLUMN tags TEXT");',
			),
		);
		assert.match(legacyRun("latest"), /applied \d+_tags\.ts/);
		assert.match(
			readFileSync(join(legacy, "db.ts"), "utf8"),
			/views: Col<"integer", \{ hasDefault: true; position: 2 \}>;\n\t\ttags: Col<"text", \{ nullable: true; position: 3 \}>;/,
		);
		legacyDb.close();

		// The schema of a long directory history; every file type-checks cold.
		const chain = project("chain");
		const chainDir = join(chain, "migrations");
		mkdirSync(chainDir);
		const chainLength = 60;
		const chainName = (n: number) => `${String(n).padStart(4, "0")}_m`;
		for (let i = 1; i <= chainLength; i++)
			writeFileSync(
				join(chainDir, `${chainName(i)}.ts`),
				i === 1
					? `import { migration } from "@typesql/core/migration";
export default migration("sqlite", {
	up: async (db) => db.add("CREATE TABLE t (id INTEGER PRIMARY KEY)"),
	down: async (db) => { await db.add("DROP TABLE t"); },
});
`
					: `import { migration } from "@typesql/core/migration";
import previous from "./${chainName(i - 1)}.js";
export default migration(previous, {
	up: async (db) => {
		const next = await db.add("ALTER TABLE t ADD COLUMN c${i} TEXT");
		await next("SELECT id, c${i} FROM t").execute();
		return next;
	},
	down: async (db) => { await db.add("ALTER TABLE t DROP COLUMN c${i}"); },
});
`,
			);
		const chainRun = (...args: string[]) =>
			cli(
				"migrate",
				...args,
				"--dialect",
				"sqlite",
				"--db",
				join(chain, "app.db"),
				"--dir",
				chainDir,
				"--out",
				join(chain, "db.ts"),
			);
		assert.match(chainRun("latest"), /applied 0060_m\.ts/);
		const chainSchema = readFileSync(join(chain, "db.ts"), "utf8");
		assert.equal(chainSchema.match(/Col</g)?.length, chainLength);
		assert.match(
			chainSchema,
			/c60: Col<"text", \{ nullable: true; position: 59 \}>;/,
		);
		assert.match(chainRun("down"), /reverted 0060_m\.ts/);
		{
			const { API } = createRequire(import.meta.url)("typescript/sync");
			const api = new API({ cwd: chain });
			try {
				const last = join(chainDir, `${chainName(chainLength)}.ts`);
				const program = api
					.createSnapshot({ openFiles: [last] })
					.getDefaultProjectForFile(last).program;
				assert.deepEqual(
					program
						.getSemanticDiagnostics(last)
						.map((d: { code: number }) => d.code),
					[],
				);
			} finally {
				api.close();
			}
		}

		// make checks its name and order.
		const generatedDir = join(dir, "generated");
		assert.match(
			fail(2, "make", "--dialect", "sqlite", "--dir", generatedDir),
			/make <name>/,
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
			/path separators/,
		);
		mkdirSync(generatedDir);
		writeFileSync(
			join(generatedDir, "9999999999_future.ts"),
			"export async function up(db) { return db; } export async function down() {}",
		);
		assert.match(
			fail(1, "make", "earlier", "--dialect", "sqlite", "--dir", generatedDir),
			/would sort before existing migration 9999999999_future\.ts/,
		);

		// Two processes apply each migration once. one.ts is a 3.x file, and
		// two.ts starts from its up.
		const concurrent = project("concurrent");
		const concurrentDir = join(concurrent, "migrations");
		mkdirSync(concurrentDir);
		writeFileSync(
			join(concurrentDir, "one.ts"),
			"export async function up(db) { await new Promise((r) => setTimeout(r, 50)); return db.add('CREATE TABLE once_only (id INTEGER)'); } export async function down(db) { return db.add('DROP TABLE once_only'); }",
		);
		writeFileSync(
			join(concurrentDir, "two.ts"),
			`import { migration } from "@typesql/core/migration";
import { up as previous } from "./one.js";
export default migration(previous, {
	up: async (db) => {
		await db("INSERT INTO once_only VALUES (1)").execute();
		return db;
	},
	down: async () => {},
});
`,
		);
		const concurrentDb = join(concurrent, "app.db");
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
		const concurrentHistory = new DatabaseSync(concurrentDb);
		try {
			assert.equal(
				concurrentHistory.prepare("SELECT count(*) AS n FROM once_only").get()
					?.n,
				1,
			);
			assert.equal(
				concurrentHistory
					.prepare("SELECT count(*) AS n FROM schema_migrations")
					.get()?.n,
				2,
			);
		} finally {
			concurrentHistory.close();
		}

		// An untyped migration has no schema: generate fails, and after a
		// migration that is only a warning.
		assert.match(
			fail(
				1,
				"generate",
				"--dialect",
				"sqlite",
				"--dir",
				concurrentDir,
				"--out",
				join(dir, "never.ts"),
			),
			/cannot read the schema of two\.ts/,
		);
		assert.match(
			fail(
				0,
				"latest",
				"--dialect",
				"sqlite",
				"--db",
				join(dir, "warned.db"),
				"--dir",
				concurrentDir,
				"--out",
				join(dir, "never.ts"),
			),
			/warning: the schema file was not updated: cannot read the schema of two\.ts[\s\S]*typesql migrate generate/,
		);
		assert.equal(existsSync(join(dir, "never.ts")), false);
	} finally {
		memory.close();
		rmSync(dir, { recursive: true, force: true });
	}
}

// Opt into the same built-package smoke on a disposable PostgreSQL database.
// Two sessions must serialize the whole command.
if (process.env.TYPESQL_MIGRATION_POSTGRES_URL) {
	const url = process.env.TYPESQL_MIGRATION_POSTGRES_URL;
	const { createMigrator, migration } = (await dist(
		"core/dist/migration/index.js",
	)) as typeof import("../packages/core/src/migration/index.ts");
	const { createRequire } = await import("node:module");
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
	const client = new Client({ connectionString: url });
	const other = new Client({ connectionString: url });
	const schema = `typesql_migration_smoke_${process.pid}`;
	await client.connect();
	await other.connect();
	try {
		await client.query(`CREATE SCHEMA "${schema}"`);
		await client.query(`SET search_path TO "${schema}"`);
		await other.query(`SET search_path TO "${schema}"`);
		const once = migration("postgres", {
			up: async (db) => {
				await db("SELECT pg_sleep(0.05)").execute();
				return db.add(
					"CREATE TABLE once_only (id integer PRIMARY KEY, note text)",
				);
			},
			down: async (db) => {
				await db.add("DROP TABLE once_only");
			},
		});
		const fill = migration(once, {
			up: async (db) => {
				await db(
					"INSERT INTO once_only (id, note) VALUES ($1, $2)",
					1,
					null,
				).execute();
				await db.raw("SAVEPOINT nested");
				await db("INSERT INTO once_only (id) VALUES (2)").execute();
				await db.raw("ROLLBACK WORK TO SAVEPOINT nested");
				await db.raw("RELEASE SAVEPOINT nested");
				return db;
			},
			down: async (db) => {
				await db("DELETE FROM once_only").execute();
			},
		});
		const on = (connection: PgConnection, migrations = [once, fill]) =>
			createMigrator({
				dialect: "postgres",
				execute: (text, values) => connection.query(text, values),
				migrations,
			});
		await assert.rejects(
			on(client)
				.with({ migrationTable: "é".repeat(64) })
				.latest(),
			/identifier limit/,
		);
		const results = await Promise.all([
			on(client).latest(),
			on(other).latest(),
		]);
		assert.deepEqual(
			results.map((result) => result.applied.length).sort(),
			[0, 2],
		);
		assert.equal(
			(await client.query("SELECT count(*)::integer AS n FROM once_only"))
				.rows[0]?.n,
			1,
		);
		const count = async () =>
			(
				await client.query(
					`SELECT count(*)::integer AS n FROM "${schema}".schema_migrations`,
				)
			).rows[0]?.n;
		assert.equal(await count(), 2);
		const status = await on(other).status();
		assert.deepEqual(
			status.map((entry) => [entry.name, entry.applied]),
			[
				["0001", true],
				["0002", true],
			],
		);
		assert.ok(
			(status[0]?.appliedAt?.getTime() ?? 0) <
				(status[1]?.appliedAt?.getTime() ?? 0),
		);
		const failing = (step: string) =>
			on(client, [
				once,
				fill,
				migration(fill, {
					up: async (db) => {
						await db.raw("CREATE TABLE rolled_back (id integer)");
						return db.raw(step);
					},
					down: async () => {},
				}),
			]).latest();
		await assert.rejects(
			failing("CREATE INDEX CONCURRENTLY bad_index ON once_only (id)"),
			/transaction|concurrently/i,
		);
		await assert.rejects(
			failing(
				"CREATE TABLE escaped_transaction (id integer); /* end */ COMMIT",
			),
			/transaction/,
		);
		assert.equal(
			(await client.query("SELECT to_regclass('rolled_back') AS name")).rows[0]
				?.name,
			null,
		);
		assert.equal(await count(), 2);
		// url opens and closes its own connection.
		const pooled = createMigrator({
			dialect: "postgres",
			url: `${url}${url.includes("?") ? "&" : "?"}options=${encodeURIComponent(`-c search_path=${schema}`)}`,
			migrations: [once, fill],
		});
		assert.deepEqual(await pooled.down(), { reverted: ["0002"] });
		assert.deepEqual(await on(client).down(), { reverted: ["0001"] });
		assert.deepEqual(await pooled.down(), { reverted: [] });
	} finally {
		await client
			.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
			.catch(() => undefined);
		await Promise.all([client.end(), other.end()]);
	}
}

console.log("dist smoke test: ok");
