/**
 * Long statements, compiled with TypeScript's default type truncation by
 * `error-messages.test.ts`: the SqlError must still be readable in the shortened diagnostic.
 */
import {
	type Col,
	createSql,
	type Generated,
	migrations,
	type Nullable,
} from "../../../src/index.js";

interface DB {
	transaction_item: {
		id: Generated<"uuid">;
		transaction_id: Col<"uuid">;
		symbol: Col<"varchar">;
		pledge: Col<"float8">;
		time: Nullable<"timestamptz">;
		amount: Nullable<"float8">;
		price: Nullable<"float8">;
		exchange_rate_time: Nullable<"timestamptz">;
		exchange_rate_from: Nullable<"varchar">;
		exchange_rate_to: Nullable<"varchar">;
		exchange_rate_rate: Nullable<"float8">;
	};
}
const sql = createSql<DB>();
declare const ids: string[];
declare const nums: number[];
declare const strs: string[];

export const inlineBulkInsert =
	sql(`INSERT INTO transaction_item (id, transaction_id, symbol, pledge, time, amount, price, exchange_rate_time, exchange_rate_from, exchange_rate_to, exchange_rate_rate)
  SELECT * FROM unnest(${sql.param(ids)}::uuid[], ${sql.param(ids)}::uuid[], ${sql.param(strs)}::varchar[], ${sql.param(nums)}::float8[], ${sql.param(nums)}::timestamptz[], ${sql.param(nums)}::float8[], ${sql.param(nums)}::float8[], ${sql.param(strs)}::timestamptz[], ${sql.param(strs)}::varchar[], ${sql.param(strs)}::varchar[], ${sql.param(nums)}::float8[])
  ON CONFLICT (id) DO UPDATE SET price = excluded.price, amount = excluded.amount, time = excluded.time`);
export const positionalBulkInsert = sql(
	`INSERT INTO transaction_item (id, transaction_id, symbol, pledge, time, amount, price, exchange_rate_time, exchange_rate_from, exchange_rate_to, exchange_rate_rate)
  SELECT * FROM unnest($1::uuid[], $2::uuid[], $3::varchar[], $4::float8[], $5::timestamptz[], $6::float8[], $7::float8[], $8::timestamptz[], $9::varchar[], $10::varchar[], $11::float8[])
  ON CONFLICT (id) DO UPDATE SET price = excluded.price, amount = excluded.amount, tme = excluded.time`,
	ids,
	ids,
	strs,
	nums,
	[],
	nums,
	nums,
	[],
	strs,
	strs,
	nums,
);
export const longDdl = migrations().add(
	`CREATE TABLE transaction_item (id uuid PRIMARY KEY, transaction_id uuid NOT NULL, symbol varchar NOT NULL, pledge float8 NOT NULL, time timestamptz, amount float8, price float8, exchange_rate_time timestamptz, exchange_rate_from varchar, exchange_rate_to varchar, exchange_rate_rate float8); ALTER TABLE transaction_itm ADD COLUMN note text`,
);
