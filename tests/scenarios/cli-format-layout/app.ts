import { createSql } from "@typesql/pg";
import { Pool } from "pg";
import type { DB } from "./db.js";
import migrator from "./typesql.config.js";

await migrator.latest();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const sql = createSql<DB>(pool);

// Long one-line strings break into a template literal, a clause per line,
// and a clause that is still too long puts an item per line.
await sql(
	"insert into users (id, name, email, active) values (1, 'Ada', 'ada@example.com', true), (2, 'Grace', null, true), (3, 'Linus', 'linus@example.com', false)",
).execute();
await sql(
	"insert into posts (id, author_id, title) values (1, 1, 'Notes'), (2, 1, null), (3, 2, 'Compilers')",
).execute();

// A short query written over several lines becomes one line.
export const one = await sql(
	`
	select id, name
	from users
	where id = $1
`,
	1,
).execute();

// A long query gets a clause per line; blank lines and trailing spaces go.
export const counts = await sql(`
    select u.id,u.name,count(p.id) as posts
    from users u left join posts p
      on p.author_id = u.id


    where u.active = true and u.email is not null   
    group by u.id, u.name order by posts desc limit 10
  `).execute();

// A select list that is too long for its line gets an item per line.
export const wide = await sql(
	"select u.id as user_id, u.name as user_name, u.email as user_email, p.title as post_title from users u join posts p on p.author_id = u.id where p.title is not null order by p.id",
).execute();

// A subquery that fits stays on its line; one that doesn't is indented.
export const recent = await sql(`with recent as (select * from posts
  where created_at > now() - interval '7 days') select author_id, count(*) as n from recent group by author_id order by author_id`).execute();
export const nested = await sql(
	"select name from users where id in (select author_id from posts where title is not null and created_at > now() - interval '30 days' and author_id > $1) order by name",
	0,
).execute();

// A line comment keeps a line break after it.
export const commented = await sql(`
	select id
	from users   -- active only
	where active order by id
`).execute();

// A fragment and the ${…} holes it is spliced into.
const titled = sql.fragment(`
	p.title is not null
`);
export const joined = await sql(
	`select p.id, u.name from posts p join users u on u.id = p.author_id where ${sql.and([titled, sql.fragment("p.id >= $1", 1)])}`,
).execute();

// An upsert gets a clause per line too.
export const upserted = await sql(
	"insert into users (id, name, email) values ($1, $2, $3) on conflict (id) do update set name = excluded.name, email = excluded.email returning id, name, email",
	1,
	"Ada Lovelace",
	null,
).execute();

console.log({
	one,
	counts,
	wide,
	recent,
	nested,
	commented,
	joined,
	upserted,
});
await pool.end();
