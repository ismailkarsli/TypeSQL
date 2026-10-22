/**
 * Error-message fixture: every call below is wrong on purpose. `error-messages.test.ts`
 * compiles this file with tsc and snapshots the diagnostics, so changes to how errors read
 * in an editor show up in review. Keep one mistake per line.
 */
import { createSql, type Col, type Generated, type Nullable, type View } from "../../../src/index.js";

interface DB {
  users: { id: Generated<"int4">; email: Col<"text">; display_name: Nullable<"text"> };
  posts: { id: Generated<"int8">; author_id: Col<"int4">; title: Col<"text">; body: Nullable<"text"> };
  user_stats: View<{ user_id: Col<"int4">; n: Col<"int8"> }>;
}
const sql = createSql<DB>();

export const unknownColumn = sql("SELECT nme FROM users");
export const typoColumn = sql("SELECT emial FROM users");
export const unknownTable = sql("SELECT id FROM post");
export const ambiguous = sql("SELECT id FROM users u JOIN posts p ON p.author_id = u.id");
export const badAlias = sql("SELECT x.id FROM users u");
export const syntax = sql("SELECT id FROM users WHERE");
export const trailing = sql("SELECT id FROM users LIMIT 1 garbage");
export const twoStatements = sql("SELECT 1; SELECT 2");
export const wrongParamType = sql("SELECT id FROM users WHERE id = $1", "7");
export const missingParam = sql("SELECT id FROM users WHERE id = $1");
export const insertMissingRequired = sql("INSERT INTO users (display_name) VALUES ($1)", "x");
export const insertNullIntoNotNull = sql("INSERT INTO users (email) VALUES ($1)", null);
export const insertIntoView = sql("INSERT INTO user_stats (user_id, n) VALUES (1, 2)");
export const setUnknownColumn = sql("UPDATE users SET emial = $1", "x");
export const unionWidth = sql("SELECT id FROM users UNION SELECT id, title FROM posts");
export const unterminated = sql("SELECT 'abc FROM users");
export const namedMissing = sql("SELECT id FROM users WHERE id = :id AND email = :email", { id: 1 });
export const dynamicFragment = sql("SELECT id FROM users {w}", { w: sql.raw("WHERE true") });
declare const userInput: string;
export const interpolatedValue = sql(`SELECT id FROM users WHERE email = '${userInput}'`);
export const inlineWrongType = sql(`SELECT id FROM users WHERE id = ${sql.param("7")}`);
export const inlineNullable = sql(`INSERT INTO users (email) VALUES (${sql.param(userInput as string | null)})`);
export const inlineInQuotes = sql(`SELECT id FROM users WHERE email = '${sql.param(userInput)}'`);
export const fragmentWrongType = sql("SELECT id FROM users WHERE true {f}", { f: sql.fragment("AND id = $1", "seven") });
export const unknownTableWithParams = sql("SELECT id FROM usrs WHERE id = $1 AND email = $2", 1, "x");
export const unknownFunction = sql("SELECT made_up_fn(email) AS x FROM users");
export const typoFunction = sql("SELECT lowr(email) FROM users");
