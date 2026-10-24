import { readFileSync } from "node:fs";
import { Client } from "pg";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { acquireDatabase } from "./db.js";

/**
 * Checks the `PgCatalog` slice (src/schema/pg-catalog.ts) against a real Postgres:
 *   - on the major version the file was generated from, regenerating it gives the same source;
 *   - every relation can be selected through both drivers, its columns come back in the declared
 *     order, NOT NULL columns hold no NULLs and every value has the `typeof` the declared type
 *     maps to (`DefaultTypeMap` / `PgTypeMap` for pg, `PostgresJsTypeMap` for postgres.js).
 * Skips (does not fail) when no database can be obtained, and the regeneration check on another
 * major, unless `TYPESQL_REQUIRE_DB=1`; see `db.ts`.
 */

const source = readFileSync(
	new URL("../../src/schema/pg-catalog.ts", import.meta.url),
	"utf8",
);
const generatedFrom = /from PostgreSQL (\d+)\./.exec(source)![1]!;

interface DeclaredColumn {
	readonly name: string;
	readonly type: string;
	readonly nullable: boolean;
}
interface DeclaredRelation {
	readonly schema: string;
	readonly name: string;
	readonly columns: DeclaredColumn[];
}

/** The relations of the generated file (its format is fixed by the generator). */
function declaredRelations(): DeclaredRelation[] {
	const out: DeclaredRelation[] = [];
	for (const block of source.matchAll(
		/^export interface (PgCatalogNamespace|InformationSchemaNamespace) \{\n([\s\S]*?)^\}/gm,
	)) {
		const schema =
			block[1] === "PgCatalogNamespace" ? "pg_catalog" : "information_schema";
		for (const rel of block[2]!.matchAll(
			/^ {2}([a-z_]+): View<\{\n([\s\S]*?)^ {2}\}>;/gm,
		)) {
			const columns = [
				...rel[2]!.matchAll(/^ {4}("?[^":]+"?): (Col|Nullable)<"([^"]+)">;/gm),
			].map((m) => ({
				name: m[1]!.replace(/"/g, ""),
				type: m[3]!,
				nullable: m[2] === "Nullable",
			}));
			out.push({ schema, name: rel[1]!, columns });
		}
	}
	return out;
}
const relations = declaredRelations();

type Driver = "pg" | "postgres.js";
const NUMBER = new Set(["int2", "int4", "float4", "float8", "oid"]);
const DATE = new Set(["date", "timestamp", "timestamptz"]);
/** Array types node-postgres has no parser for: they arrive as the raw `{...}` text. */
const PG_RAW_ARRAYS = new Set(["aclitem[]", "char[]", "name[]"]);

/** `typeof` a non-NULL value of `type` has with the adapter's type map. `null`: not checked (unknown). */
function expectedTypeof(type: string, driver: Driver): string | null {
	if (type === "anyarray") return null;
	if (type.endsWith("[]"))
		return driver === "pg" && PG_RAW_ARRAYS.has(type) ? "string" : "object";
	if (NUMBER.has(type)) return "number";
	if (type === "bool") return "boolean";
	if (DATE.has(type) || type === "bytea") return "object";
	if (type === "interval") return driver === "pg" ? "object" : "string";
	return "string";
}

/** Objects created before the checks so that the catalog views have rows to look at. */
const fixtures = [
	"DROP SCHEMA IF EXISTS catalog_fixture CASCADE",
	"CREATE SCHEMA catalog_fixture",
	"CREATE TYPE catalog_fixture.mood AS ENUM ('happy', 'sad')",
	"CREATE DOMAIN catalog_fixture.positive AS int4 CHECK (VALUE > 0)",
	`CREATE TABLE catalog_fixture.parent (id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY, name varchar(40) NOT NULL UNIQUE)`,
	`CREATE TABLE catalog_fixture.child (
     id bigserial PRIMARY KEY,
     parent_id int REFERENCES catalog_fixture.parent (id),
     mood catalog_fixture.mood,
     amount catalog_fixture.positive,
     price numeric(10, 2) CHECK (price >= 0),
     created_at timestamptz DEFAULT now()
   )`,
	"CREATE INDEX child_mood ON catalog_fixture.child (mood)",
	"CREATE VIEW catalog_fixture.child_names AS SELECT c.id, p.name FROM catalog_fixture.child c JOIN catalog_fixture.parent p ON p.id = c.parent_id",
	"CREATE MATERIALIZED VIEW catalog_fixture.child_count AS SELECT count(*) AS n FROM catalog_fixture.child",
	"CREATE FUNCTION catalog_fixture.touch() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.created_at := now(); RETURN NEW; END $$",
	"CREATE TRIGGER child_touch BEFORE INSERT ON catalog_fixture.child FOR EACH ROW EXECUTE FUNCTION catalog_fixture.touch()",
	"CREATE FUNCTION catalog_fixture.add(a int, b int DEFAULT 1, OUT s int) LANGUAGE sql AS $$ SELECT a + b $$",
	"COMMENT ON TABLE catalog_fixture.parent IS 'parents'",
	"INSERT INTO catalog_fixture.parent (name) VALUES ('a'), ('b')",
	"INSERT INTO catalog_fixture.child (parent_id, mood, amount, price) VALUES (1, 'happy', 3, 1.5), (2, NULL, NULL, NULL)",
	"ANALYZE catalog_fixture.child",
	"SELECT * FROM catalog_fixture.child WHERE id = 1",
];

const db = await acquireDatabase();

describe.skipIf(!db)("PgCatalog against Postgres", () => {
	let client: Client;
	let pgjs: postgres.Sql;
	let major = "";

	beforeAll(async () => {
		client = new Client({ connectionString: db!.url });
		await client.connect();
		pgjs = postgres(db!.url, { max: 1, onnotice: () => undefined });
		for (const statement of fixtures) await client.query(statement);
		major = (
			await client.query<{ v: string }>(
				"SELECT current_setting('server_version') AS v",
			)
		).rows[0]!.v.split(/[.\s]/)[0]!;
	}, 60_000);

	afterAll(async () => {
		await client?.query("DROP SCHEMA IF EXISTS catalog_fixture CASCADE");
		await client?.end();
		await pgjs?.end();
		await db?.close();
	}, 60_000);

	test("the checked-in file is what the generator writes for this server", async (ctx) => {
		if (major !== generatedFrom) {
			// CI runs the major the file is generated from: there the comparison must not drop out silently.
			if (process.env["TYPESQL_REQUIRE_DB"] === "1")
				throw new Error(
					`generated from PostgreSQL ${generatedFrom}, server is ${major}`,
				);
			ctx.skip(
				`generated from PostgreSQL ${generatedFrom}, server is ${major}`,
			);
		}
		const generator = new URL(
			"../../../../scripts/pg-catalog-from-pg.ts",
			import.meta.url,
		).href;
		const { generatePgCatalog } = (await import(generator)) as {
			generatePgCatalog(c: Client): Promise<string>;
		};
		expect(await generatePgCatalog(client)).toBe(source);
	}, 60_000);

	test("the slice covers the relations Magnus queries", () => {
		const names = relations.map((r) => `${r.schema}.${r.name}`);
		for (const n of [
			"pg_catalog.pg_stat_activity",
			"pg_catalog.pg_stat_database",
			"pg_catalog.pg_tables",
			"pg_catalog.pg_database",
			"information_schema.columns",
			"information_schema.tables",
		]) {
			expect(names).toContain(n);
		}
	});

	describe.each(["pg", "postgres.js"] as const)("%s", (driver) => {
		test.each(relations.map((r) => [`${r.schema}.${r.name}`, r] as const))(
			"%s",
			async (_, rel) => {
				const text = `SELECT * FROM ${rel.schema}.${rel.name}`;
				let rows: Record<string, unknown>[];
				let columns: string[];
				if (driver === "pg") {
					const result = await client.query(text);
					rows = result.rows;
					columns = result.fields.map((f) => f.name);
				} else {
					const result = await pgjs.unsafe(text);
					rows = Array.from(result);
					columns = result.columns.map((c) => c.name);
				}
				// Other majors add or drop columns: there only the declared columns that exist are checked.
				if (major === generatedFrom)
					expect(columns).toEqual(rel.columns.map((c) => c.name));
				for (const row of rows) {
					for (const col of rel.columns.filter((c) =>
						columns.includes(c.name),
					)) {
						const value = row[col.name];
						if (value === null) {
							expect
								.soft(
									col.nullable,
									`${rel.name}.${col.name} is declared NOT NULL but returned NULL`,
								)
								.toBe(true);
							continue;
						}
						const want = expectedTypeof(col.type, driver);
						if (want !== null)
							expect
								.soft(typeof value, `${rel.name}.${col.name} (${col.type})`)
								.toBe(want);
					}
				}
			},
			30_000,
		);
	});
});
