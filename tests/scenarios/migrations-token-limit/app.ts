import { migration } from "@typesql/core/migration";

// TypeSQL checks scripts of up to 4096 tokens. A longer one is a size error,
// not a syntax error at a valid token such as the quoted column "group".
// One statement is 15 tokens: 273 are 4095 tokens, 274 are 4110.
const pg1 = `SELECT "group", id FROM t WHERE "group" = 1 AND id = 2; `;
const pg16 = `${pg1}${pg1}${pg1}${pg1}${pg1}${pg1}${pg1}${pg1}${pg1}${pg1}${pg1}${pg1}${pg1}${pg1}${pg1}${pg1}`;
const pg256 = `${pg16}${pg16}${pg16}${pg16}${pg16}${pg16}${pg16}${pg16}${pg16}${pg16}${pg16}${pg16}${pg16}${pg16}${pg16}${pg16}`;
const pgTable = migration("postgres", {
	name: "001-table",
	up: async (db) => db.ddl('CREATE TABLE t (id int4, "group" int4)'),
	down: async (db) => db.ddl("DROP TABLE t"),
});
export const pgUnder = migration(pgTable, {
	name: "002-under",
	up: async (db) => db.ddl(`${pg256}${pg16}${pg1}`),
	down: async () => {},
});
migration(pgTable, {
	name: "002-over",
	up: async (db) => db.ddl(`${pg256}${pg16}${pg1}${pg1}`),
	down: async () => {},
});

const my1 = "SELECT `group`, id FROM t WHERE `group` = 1 AND id = 2; ";
const my16 = `${my1}${my1}${my1}${my1}${my1}${my1}${my1}${my1}${my1}${my1}${my1}${my1}${my1}${my1}${my1}${my1}`;
const my256 = `${my16}${my16}${my16}${my16}${my16}${my16}${my16}${my16}${my16}${my16}${my16}${my16}${my16}${my16}${my16}${my16}`;
const myTable = migration("mysql", {
	name: "001-table",
	up: async (db) => db.ddl("CREATE TABLE t (id int, `group` int)"),
	down: async (db) => db.ddl("DROP TABLE t"),
});
export const myUnder = migration(myTable, {
	name: "002-under",
	up: async (db) => db.ddl(`${my256}${my16}${my1}`),
	down: async () => {},
});
migration(myTable, {
	name: "002-over",
	up: async (db) => db.ddl(`${my256}${my16}${my1}${my1}`),
	down: async () => {},
});

const lite1 = `SELECT "group", id FROM t WHERE "group" = 1 AND id = 2; `;
const lite16 = `${lite1}${lite1}${lite1}${lite1}${lite1}${lite1}${lite1}${lite1}${lite1}${lite1}${lite1}${lite1}${lite1}${lite1}${lite1}${lite1}`;
const lite256 = `${lite16}${lite16}${lite16}${lite16}${lite16}${lite16}${lite16}${lite16}${lite16}${lite16}${lite16}${lite16}${lite16}${lite16}${lite16}${lite16}`;
const liteTable = migration("sqlite", {
	name: "001-table",
	up: async (db) => db.ddl('CREATE TABLE t (id int, "group" int)'),
	down: async (db) => db.ddl("DROP TABLE t"),
});
export const liteUnder = migration(liteTable, {
	name: "002-under",
	up: async (db) => db.ddl(`${lite256}${lite16}${lite1}`),
	down: async () => {},
});
migration(liteTable, {
	name: "002-over",
	up: async (db) => db.ddl(`${lite256}${lite16}${lite1}${lite1}`),
	down: async () => {},
});
