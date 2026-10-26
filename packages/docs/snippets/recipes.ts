import type { ParamsType, RowType } from "@typesql/core";
import { check, type Equal } from "./_check.js";
import { sql } from "./schema.js";

declare const filters: { email: string | null; minId: number | null };
// #region optional-filters
const found = sql(
	`SELECT id, email FROM users
   WHERE (:email::text IS NULL OR email = :email)
     AND (:minId::int4 IS NULL OR id >= :minId)`,
	{ email: filters.email, minId: filters.minId },
);
// params: [string | null, number | null]: pass null to skip a filter
// #endregion optional-filters
check<Equal<ParamsType<typeof found>, [string | null, number | null]>>();
check<Equal<RowType<typeof found>, { id: number; email: string }>>();

declare const sort: "newest" | "oldest" | "email";
// #region sort
const ORDER = {
	newest: sql.fragment("created_at DESC"),
	oldest: sql.fragment("created_at"),
	email: sql.fragment("email"),
} as const;

const sortedUsers = sql("SELECT id, email FROM users ORDER BY {order}, id", {
	order: ORDER[sort],
});
// checked once for each of the three orders
// #endregion sort
check<Equal<RowType<typeof sortedUsers>, { id: number; email: string }>>();

// #region nested-json
const authors = sql(`
  SELECT u.id, u.email,
         coalesce(
           (SELECT json_agg(json_build_object('id', p.id, 'title', p.title) ORDER BY p.id)
            FROM posts p WHERE p.author_id = u.id),
           '[]'
         ) AS posts
  FROM users u`);
// { id: number; email: string; posts: { id: number; title: string }[] }
// #endregion nested-json
check<
	Equal<
		RowType<typeof authors>,
		{ id: number; email: string; posts: { id: number; title: string }[] }
	>
>();

// #region patch
type UserPatch = {
	display_name?: string | null;
	mood?: "happy" | "neutral" | "sad";
};

function updateUser(id: number, patch: UserPatch) {
	const set = sql.set("users", patch); // throws when no value is defined
	return sql("UPDATE users SET {set} WHERE id = $1 RETURNING id", { set }, id);
}
// #endregion patch
check<Equal<RowType<ReturnType<typeof updateUser>>, { id: number }>>();

declare const newPosts: { author_id: number; title: string }[];
// #region bulk
const rows = sql.values("posts", newPosts);
const created = sql("INSERT INTO posts {rows} RETURNING id", { rows });
// #endregion bulk
check<Equal<RowType<typeof created>, { id: string }>>();

// #region unnest
const authorIds = newPosts.map((p) => p.author_id);
const titles = newPosts.map((p) => p.title);
const createdMany = sql(
	"INSERT INTO posts (author_id, title) SELECT * FROM unnest($1::int4[], $2::text[]) RETURNING id",
	authorIds,
	titles,
);
// params: [(number | null)[], (string | null)[]]
// #endregion unnest
check<Equal<RowType<typeof createdMany>, { id: string }>>();
check<
	Equal<ParamsType<typeof createdMany>, [(number | null)[], (string | null)[]]>
>();
