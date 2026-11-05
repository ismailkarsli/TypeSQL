import { createSql } from "@typesql/core";
import { type Col, type Json, mariadb, mysql } from "@typesql/core/mysql";

interface DB {
	users: {
		id: Col<"int">;
		email: Col<"varchar">;
		settings: Json<{ theme: string }>;
	};
}
const onMysql = createSql<DB>(mysql);
const onMariaDb = createSql<DB>(mariadb);

onMysql("SELECT emial FROM users");
onMysql("SELECT id FROM users WHERE id = ?");
onMysql("INSERT INTO users (id, email) VALUES ($1, $2) RETURNING id", 1, "a");
onMysql("SELECT email, COUNT(*) FROM users");
onMysql("SELECT id FROM users WHERE id = $1", "wrong");

onMariaDb("SELECT settings -> '$.theme' AS theme FROM users");
onMariaDb("SELECT * FROM users AS u LATERAL");
