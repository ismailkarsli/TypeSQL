/**
 * `@typesql/core/adapter`: what driver adapters and custom executors build on. Applications
 * import `@typesql/core` or an adapter package instead.
 */

export { mapRows, rowKeysOf } from "./query.js";
export { camelCase } from "./row-keys.js";
export { JsonParam } from "./runtime/json.js";
export {
	createTransactionalSql,
	runTransaction,
	type SqlDriver,
} from "./transaction.js";
