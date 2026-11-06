// What adapters build on: the drivers' side of `sql` (executors,
// transactions, values, results and connections), the schema source that
// introspection and generators write, and the `typesql` commands' shell.

export {
	type ColumnFlags,
	colFlags,
	colSource,
	columnSource,
	doc,
	globRegExp,
	helperImport,
	propertyKey,
	RESERVED_KEYS,
	type SchemaDialect,
	type SchemaModule,
	schemaMembers,
	schemaWriter,
} from "./codegen.js";
export {
	type CommandEnv,
	type CommandIo,
	commandIo,
	databaseUrl,
	errorMessage,
	type IntrospectOutput,
	introspectArgs,
	introspectCommand,
	listOption,
	UsageError,
} from "./command.js";
export type { Connection } from "./connect.js";
export {
	type DialectFamily,
	dialectFamily,
	familyStatement,
} from "./family.js";
export {
	connectMysql,
	type MySqlClient,
	type MySqlResult,
	type MySqlValue,
	mysqlBind,
	mysqlInline,
	mysqlPositional,
	mysqlResult,
	mysqlSplit,
	mysqlValue,
} from "./mysql/driver.js";
export {
	connectPostgres,
	type PgClient,
	type PgField,
	type PgLookup,
	parsePgArray,
	parsePgUserArrays,
	pgResult,
} from "./postgres/driver.js";
export { mapRows, pluginsOf } from "./query.js";
export type { PositionalStatement, SplitStatement } from "./runtime/compile.js";
export { JsonParam, jsonText } from "./runtime/json.js";
export {
	connectSqlite,
	paramNumbers,
	positional,
	type SqliteClient,
	type SqliteInput,
	splitParams,
	sqliteBindings,
	sqliteValue,
} from "./sqlite/driver.js";
export {
	createFamilySql,
	createTransactionalSql,
	pooledTransaction,
	runTransaction,
	type SqlDriver,
	serialTransaction,
} from "./transaction.js";
