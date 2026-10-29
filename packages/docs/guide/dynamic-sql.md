# Dynamic SQL

This page shows how to build statements from pieces and keep them type-checked. You write a piece once as a **fragment** and splice it into statements through `{name}` slots. Splicing happens before type inference, so the finished statement is checked as a whole.

## Slots

```ts
const byAuthor7 = sql.fragment("WHERE p.author_id = $1", 7);
const q = sql("SELECT p.id, p.title FROM posts p {byAuthor7} ORDER BY p.id", {
	byAuthor7,
});
q.text;
```

Only `{identifier}` is a slot. Braces inside string literals, such as `'{1,2}'`, are left alone.

A fragment's parameters are renumbered to follow the statement's. Arguments after the slot object belong to the outer statement:

```ts
const byAuthor = sql(
	"SELECT p.title FROM posts p WHERE p.author_id = $1 {more}",
	{ more: sql.fragment(`AND p.title <> ${sql.param("draft")}`) },
	42,
);
byAuthor.text;
byAuthor.values;
```

The values a fragment carries are checked once it is spliced, whether they came as arguments, a `:name` object or `sql.param()`:

```ts
const wrong = sql.fragment("AND p.author_id = $1", "seven");
sql("SELECT p.id FROM posts p WHERE true {wrong}", { wrong });
```

Fragments can be reused in any number of statements. Each union member and each distinct list element adds a check, so see [Limits](./limits) for the cost.

## Queries as subqueries

You can splice a whole query too, for example into `IN (…)`:

```ts
const authors = sql(
	"SELECT author_id FROM posts GROUP BY author_id HAVING count(*) >= $1::int4",
	3,
);
const prolific = sql("SELECT email FROM users WHERE id IN ({authors})", {
	authors,
});
```

## Identifiers and lists

- `sql.id(…)` quotes an identifier. `sql.id("schema", "table")` gives `"schema"."table"`.
- `sql.combine([…], { separator })` combines fragments and renumbers their parameters in order.

Both keep their text as a literal type, so the statement is still fully typed:

```ts
const column = sql.id("display_name");
const both = sql.combine(
	[
		sql.fragment("u.id > $1", 10),
		sql.fragment(`u.email LIKE ${sql.param("%@example.com")}`),
	],
	{ separator: " AND " },
);
const listed = sql("SELECT {column} FROM users u WHERE {both}", {
	column,
	both,
});
listed.text;
```

::: warning Allowlisting identifier inputs
`sql.id(…)` double-quotes strings to prevent SQL syntax injection, but does not perform application-level authorization or column filtering. Passing untrusted user input directly to `sql.id()` allows callers to specify sensitive columns (such as `password_hash` in an `ORDER BY` or `SELECT`) or query internal tables. Always validate dynamic identifier names against an allowlist before passing them to `sql.id()`.
:::

::: danger Dynamic separators
The `options.separator` value in `sql.combine()` is inserted into the query as **raw SQL text**. Never pass untrusted user input as the separator. Use constant delimiters such as `", "`, `" AND "`, or `" OR "`.
:::

### A name from a union

If the name's type is a union of literals, the fragment's text is a union too. The statement is checked once for each member, and the row type is the union of their rows:

```ts
declare const shown: "email" | "display_name";
const pick = sql.id(shown);
const picked = sql("SELECT {pick} FROM users", { pick });

function countRows<T extends RelationName<DB>>(table: T) {
	const t = sql.id(table);
	return sql("SELECT count(*) AS n FROM {t}", { t });
}
```

Inside a generic function, the name isn't known until the call:

- A generic constrained to `RelationName<DB>` (the top-level tables and views) is checked against every relation. The row type is the union of all their rows.
- Any other generic or `string` name gives a dynamic fragment, which needs [`sql.as`](#fully-dynamic-sql).
- To check against a smaller set, narrow the name yourself: `sql.id(name as "users" | "posts")`.

`sql.combine(items, { separator: " AND " })` keeps the literal text for a tuple written in place. The separator defaults to `", "` when options are omitted. An array built at runtime is checked as a list, below.

## Lists from runtime arrays

`sql.combine` also combines an array whose length and order are only known at runtime, such as sort keys a user picked. Each element's text must be known at compile time (fragments from a constant table, or `sql.id` over a union of names), so the statement stays checked:

```ts
const SORT = {
	title: { asc: sql.fragment("p.title"), desc: sql.fragment("p.title DESC") },
	author: {
		asc: sql.fragment("p.author_id"),
		desc: sql.fragment("p.author_id DESC"),
	},
} as const;
declare const sortBy: { field: keyof typeof SORT; dir: "asc" | "desc" }[];
const order = sql.combine([
	...sortBy.map(({ field, dir }) => SORT[field][dir]),
	sql.fragment("p.id"),
]);
const sorted = sql("SELECT p.id, p.title FROM posts p ORDER BY {order}", {
	order,
});
```

TypeSQL doesn't try every combination. It checks the statement once, with each distinct element present once. In a list position (`ORDER BY`, `GROUP BY`, `SET`, `VALUES` rows, `IN (…)`, an `AND` chain) each element is checked on its own. So if that one statement is valid, every count and order of the elements is valid too.

::: warning Empty arrays
An empty array throws at runtime. Always include a fixed element, like the `p.id` tiebreaker above, or start an `AND` chain with `sql.fragment("true")`.
:::

- The query's text type (`TextType`) is that one-of-each statement, not the text sent at runtime. At runtime, elements are repeated and renumbered as given.
- In a select list (`SELECT {cols}`), the row type counts every element as selected, even if only some are at runtime.
- An element whose text is dynamic (`sql.raw`) makes the whole list dynamic.

## Fully dynamic SQL

Sometimes the shape of a statement is only known at runtime: `sql.raw(text)`, or `sql.combine` over an array of fragments whose texts aren't known. TypeSQL can't infer anything then, and splicing such a fragment into `sql(…)` is a compile error.

Use `sql.as<Row>(…)` instead. It takes the same arguments, skips inference, and lets you state the row type:

```ts
declare const userChosenColumns: string[];
const raw = sql.raw(
	userChosenColumns.map((c) => `"${c.replaceAll('"', '""')}"`).join(", "),
);
const dynamic = sql.as<{ [column: string]: unknown }>(
	"SELECT {raw} FROM users",
	{ raw },
);
```

::: danger
`sql.raw` text is sent as it is. Never put user input in it.
:::
