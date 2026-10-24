import {
	createSql,
	type Executor,
	type RowType,
	type Sig,
} from "@typesql/core";
import { check, type Equal } from "./_check.js";
import { type DB, sql } from "./schema.js";

// #region joins
const joined = sql(`
  SELECT u.email, p.title, s.posts
  FROM users u
  LEFT JOIN posts p ON p.author_id = u.id
  JOIN user_stats s ON s.user_id = u.id`);
// { email: string; title: string | null; posts: string }
// #endregion joins
check<
	Equal<
		RowType<typeof joined>,
		{ email: string; title: string | null; posts: string }
	>
>();

// #region naming
const named = sql(`
  SELECT id + 1, lower(email), id::text, count(*) OVER (),
         CASE WHEN id > 10 THEN 'big' END,
         coalesce(display_name, email) AS name
  FROM users`);
// { "?column?": number; lower: string; id: string; count: string;
//   case: string | null; name: string }
// #endregion naming
check<
	Equal<
		RowType<typeof named>,
		{
			"?column?": number;
			lower: string;
			id: string;
			count: string;
			case: string | null;
			name: string;
		}
	>
>();

declare const executor: Executor;
// #region row-keys
const camel = createSql<DB>(executor, { rowKeys: "camelCase" });

const rows = await camel(
	"SELECT id, display_name, created_at, count(*) OVER () AS total_count FROM users",
).execute();
// { id: number; displayName: string | null; createdAt: Date; totalCount: string }[]
// #endregion row-keys
check<
	Equal<
		typeof rows,
		{
			id: number;
			displayName: string | null;
			createdAt: Date;
			totalCount: string;
		}[]
	>
>();

// #region aggregates
const totals = sql(
	`SELECT author_id, count(*) AS n, max(title) AS last FROM posts GROUP BY author_id`,
);
// { author_id: number; n: string; last: string }
const overall = sql(`SELECT count(*) AS n, max(title) AS last FROM posts`);
// { n: string; last: string | null }   ← no GROUP BY: max() of zero rows is NULL
// #endregion aggregates
check<
	Equal<RowType<typeof totals>, { author_id: number; n: string; last: string }>
>();
check<Equal<RowType<typeof overall>, { n: string; last: string | null }>>();

// #region structure
const structured = sql(`
  WITH active AS (
    SELECT author_id, count(*) AS n FROM posts GROUP BY author_id
  )
  SELECT u.email,
         (SELECT max(p.title) FROM posts p WHERE p.author_id = u.id) AS latest,
         EXISTS (SELECT 1 FROM active a WHERE a.author_id = u.id) AS has_posts
  FROM users u
  UNION ALL
  SELECT 'nobody', NULL, false`);
// { email: string; latest: string | null; has_posts: boolean }
// #endregion structure
check<
	Equal<
		RowType<typeof structured>,
		{ email: string; latest: string | null; has_posts: boolean }
	>
>();

// #region wholerow
const withPosts = sql(`
  SELECT u.email, (p).title, p IS NULL AS no_posts
  FROM users u LEFT JOIN posts p ON p.author_id = u.id`);
// { email: string; title: string | null; no_posts: boolean }
// #endregion wholerow
check<
	Equal<
		RowType<typeof withPosts>,
		{ email: string; title: string | null; no_posts: boolean }
	>
>();

// #region json
const profiles = sql(`
  SELECT u.id,
         json_build_object('email', u.email, 'since', u.created_at) AS profile,
         coalesce((SELECT json_agg(p ORDER BY p.id) FROM posts p WHERE p.author_id = u.id), '[]') AS posts
  FROM users u`);
// { id: number;
//   profile: { email: string; since: string };   ← a timestamp is a string inside JSON
//   posts: { id: number; author_id: number; title: string; body: string | null; tags: string[] }[] }
// #endregion json
check<
	Equal<
		RowType<typeof profiles>,
		{
			id: number;
			profile: { email: string; since: string };
			posts: {
				id: number;
				author_id: number;
				title: string;
				body: string | null;
				tags: string[];
			}[];
		}
	>
>();

// #region jsonread
const firstTags = sql(`
  SELECT j -> 'tags' -> 0 AS first_tag, j ->> 'title' AS title
  FROM (SELECT json_build_object('title', title, 'tags', tags) AS j FROM posts) s`);
// { first_tag: string | null; title: string | null }
// #endregion jsonread
check<
	Equal<
		RowType<typeof firstTags>,
		{ first_tag: string | null; title: string | null }
	>
>();

// #region narrowing
const withTitles = sql(`
  SELECT u.email, p.title
  FROM users u LEFT JOIN posts p ON p.author_id = u.id
  WHERE p.title IS NOT NULL`);
// { email: string; title: string }   ← narrowed by the WHERE clause
// #endregion narrowing
check<Equal<RowType<typeof withTitles>, { email: string; title: string }>>();

// #region unknown-function
// @ts-expect-error function slugify(text) does not exist. Declare it in the schema's $functions or in FunctionCatalog
sql(`SELECT slugify(email) AS slug FROM users`);
// #endregion unknown-function

// #region functions
interface AppDB extends DB {
	$functions: {
		slugify: Sig<["text"], "text">; // strict (the default): NULL in, NULL out
		rank_in: Sig<["int4", "..."], "int8", { nullable: false }>;
	};
}
const appSql = createSql<AppDB>();
const slugs = appSql(
	`SELECT slugify(email) AS slug, slugify(display_name) AS alt, rank_in(id, 1, 2) AS r FROM users`,
);
// { slug: string; alt: string | null; r: string }
// #endregion functions
check<
	Equal<RowType<typeof slugs>, { slug: string; alt: string | null; r: string }>
>();

// #region enum
const moods = sql(`SELECT mood, count(*) AS n FROM users GROUP BY mood`);
// { mood: "happy" | "neutral" | "sad"; n: string }
// #endregion enum
check<
	Equal<RowType<typeof moods>, { mood: "happy" | "neutral" | "sad"; n: string }>
>();
