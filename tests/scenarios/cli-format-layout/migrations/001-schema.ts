import { migration } from "@typesql/core/migration";

export default migration("postgres", {
	up: async (db) =>
		db.ddl(`create table users (id int primary key, name text not null, email text, active boolean not null default true);
create table posts (id int primary key, author_id int not null references users(id), title text, created_at timestamptz not null default now())`),
	down: async (db) => {
		await db.ddl(`
			drop table posts;

			drop table users
		`);
	},
});
