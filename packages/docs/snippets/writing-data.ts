import type { ParamsType, RowType } from "typesql";
import { check, type Equal } from "./_check.js";
import { sql } from "./schema.js";

// #region insert
const created = sql(
  "INSERT INTO users (email, display_name, mood) VALUES ($1, $2, $3) RETURNING id, created_at",
  "a@b.c",
  null,
  "happy",
);
// Query<{ id: number; created_at: Date }, [string, string | null, "happy" | "neutral" | "sad"]>
// #endregion insert
check<Equal<RowType<typeof created>, { id: number; created_at: Date }>>();
check<Equal<ParamsType<typeof created>, [string, string | null, "happy" | "neutral" | "sad"]>>();

// #region update
const renamed = sql("UPDATE users SET display_name = $1 WHERE id = $2", "Ada", 7);
// RowType<typeof renamed> is never: no RETURNING. Run it with execute() to get the row count.
const touched = sql(`
  UPDATE posts p SET title = upper(p.title)
  FROM users u
  WHERE u.id = p.author_id AND u.mood = 'sad'
  RETURNING p.id, u.email`);
// { id: string; email: string }
// #endregion update
check<Equal<RowType<typeof renamed>, never>>();
check<Equal<RowType<typeof touched>, { id: string; email: string }>>();

// #region upsert
const upsert = sql(`
  INSERT INTO users (email, mood) VALUES ($1, $2)
  ON CONFLICT (email) DO UPDATE SET mood = EXCLUDED.mood
  RETURNING id`, "a@b.c", "neutral");
// #endregion upsert
check<Equal<RowType<typeof upsert>, { id: number }>>();

// #region delete
const removed = sql("DELETE FROM posts p USING users u WHERE u.id = p.author_id AND u.email = $1 RETURNING p.id, p.title", "a@b.c");
// { id: string; title: string }
// #endregion delete
check<Equal<RowType<typeof removed>, { id: string; title: string }>>();

// #region cte
const moved = sql(`
  WITH archived AS (
    DELETE FROM posts WHERE author_id = $1 RETURNING id
  )
  SELECT count(*) AS n FROM archived`, 7);
// { n: string }
// #endregion cte
check<Equal<RowType<typeof moved>, { n: string }>>();
