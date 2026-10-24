import type { Col, Generated, Nullable, RowType, View } from "@typesql/core";
import { check, type Equal, type Same } from "./_check.js";

// #region overview
import { createSql, migrations, type SchemaOf } from "@typesql/core";

export const m = migrations()
	.add("CREATE TYPE mood AS ENUM ('happy', 'sad')")
	.add(
		"CREATE TABLE users (id serial PRIMARY KEY, email text NOT NULL UNIQUE, mood mood)",
	)
	.add("ALTER TABLE users ADD COLUMN display_name text")
	.add("CREATE VIEW user_emails AS SELECT id, email FROM users");

type DB = SchemaOf<typeof m>;
// {
//   $types: { mood: "happy" | "sad" };
//   users: { id: Generated<"int4">; email: Col<"text">; mood: Nullable<"mood">; display_name: Nullable<"text"> };
//   user_emails: View<{ id: Col<"int4">; email: Col<"text"> }>;
// }

const sql = createSql<DB>();
const q = sql("SELECT id, mood FROM users WHERE email = $1", "a@b.c");
// { id: number; mood: "happy" | "sad" | null }
// #endregion overview
check<
	Same<
		DB["users"],
		{
			id: Generated<"int4">;
			email: Col<"text">;
			mood: Nullable<"mood">;
			display_name: Nullable<"text">;
		}
	>
>();
check<Same<DB["user_emails"], View<{ id: Col<"int4">; email: Col<"text"> }>>>();
check<Equal<DB["$types"]["mood"], "happy" | "sad">>();
check<Equal<RowType<typeof q>, { id: number; mood: "happy" | "sad" | null }>>();
