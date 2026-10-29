import { createSql } from "@typesql/kysely";
import {
	type ColumnType,
	type Generated,
	Kysely,
	PostgresDialect,
} from "kysely";
import { Pool } from "pg";

type Int8 = ColumnType<
	string,
	bigint | number | string,
	bigint | number | string
>;
type Timestamp = ColumnType<Date, Date | string, Date | string>;
type Mood = "happy" | "sad";

interface DB {
	users: {
		id: Generated<number>;
		email: string;
		mood: Mood | null;
		created_at: Generated<Timestamp>;
	};
	posts: {
		id: Generated<Int8>;
		author_id: number;
		title: string;
		published: Generated<boolean>;
	};
}

const db = new Kysely<DB>({
	dialect: new PostgresDialect({ pool: new Pool() }),
});
const sql = createSql<DB>(db);

const drafts = await db
	.selectFrom("posts")
	.select(["id", "title"])
	.where("published", "=", false)
	.execute();

const leaderboard = sql(
	`SELECT u.email, u.mood, count(p.id) AS posts,
                               rank() OVER (ORDER BY count(p.id) DESC) AS place
                        FROM users u LEFT JOIN posts p ON p.author_id = u.id AND p.published
                        WHERE u.mood = $1
                        GROUP BY u.id`,
	"happy",
);
const ranked = await leaderboard.execute();

await db.transaction().execute(async (trx) => {
	await trx
		.updateTable("posts")
		.set({ published: true })
		.where("author_id", "=", 1)
		.execute();
	await createSql<DB>(trx)(
		`DELETE FROM posts WHERE author_id = $1 AND NOT published`,
		1,
	).execute();
});

sql(`SELECT id FROM users WHERE mood = $1`, "angry");
