import type { RowType } from "typesql";
import { check, type Equal } from "./_check.js";
import { sql } from "./schema.js";

// #region joins
const joined = sql(`
  SELECT u.email, p.title, s.posts
  FROM users u
  LEFT JOIN posts p ON p.author_id = u.id
  JOIN user_stats s ON s.user_id = u.id`);
// { email: string; title: string | null; posts: string }
// #endregion joins
check<Equal<RowType<typeof joined>, { email: string; title: string | null; posts: string }>>();

// #region naming
const named = sql(`
  SELECT id + 1, lower(email), id::text, count(*) OVER (),
         CASE WHEN id > 10 THEN 'big' END,
         coalesce(display_name, email) AS name
  FROM users`);
// { "?column?": number; lower: string; id: string; count: string;
//   case: string | null; name: string }
// #endregion naming
check<Equal<RowType<typeof named>, { "?column?": number; lower: string; id: string; count: string; case: string | null; name: string }>>();

// #region aggregates
const totals = sql(`SELECT author_id, count(*) AS n, max(title) AS last FROM posts GROUP BY author_id`);
// { author_id: number; n: string; last: string }
const overall = sql(`SELECT count(*) AS n, max(title) AS last FROM posts`);
// { n: string; last: string | null }   ← no GROUP BY: max() of zero rows is NULL
// #endregion aggregates
check<Equal<RowType<typeof totals>, { author_id: number; n: string; last: string }>>();
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
check<Equal<RowType<typeof structured>, { email: string; latest: string | null; has_posts: boolean }>>();

// #region narrowing
const withTitles = sql(`
  SELECT u.email, p.title
  FROM users u LEFT JOIN posts p ON p.author_id = u.id
  WHERE p.title IS NOT NULL`);
// { email: string; title: string }   ← narrowed by the WHERE clause
// #endregion narrowing
check<Equal<RowType<typeof withTitles>, { email: string; title: string }>>();

// #region unknown
const fn = sql(`SELECT my_extension_fn(id) AS a, my_extension_fn(id)::int4 AS b FROM users`);
// { a: unknown; b: number | null }
// #endregion unknown
check<Equal<RowType<typeof fn>, { a: unknown; b: number | null }>>();

// #region enum
const moods = sql(`SELECT mood, count(*) AS n FROM users GROUP BY mood`);
// { mood: "happy" | "neutral" | "sad"; n: string }
// #endregion enum
check<Equal<RowType<typeof moods>, { mood: "happy" | "neutral" | "sad"; n: string }>>();
