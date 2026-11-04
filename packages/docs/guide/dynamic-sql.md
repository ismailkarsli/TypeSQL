---
description: "Build SQL from fragments with sql.fragment, sql.id, sql.and, sql.set and more, and keep the finished statement type-checked."
---

# Dynamic SQL

This page shows how to build statements from pieces and keep them type-checked. You write a piece once as a **fragment** and interpolate it into statements as `${fragment}`. Splicing happens before type inference, so the finished statement is checked as a whole.

## Fragments

Every `sql.*` function that builds a fragment (`sql.fragment`, `sql.id`, `sql.combine`, `sql.and`, `sql.or`, `sql.set`, `sql.values` and `sql.raw`) gives a value you write straight into the SQL template:

```ts
const column = sql.id("display_name");
const recent = sql.fragment("u.id > $1", 10);
const q = sql(
	`SELECT ${column} FROM users u WHERE ${recent} AND u.email <> $1`,
	"a@b.c",
);
q.text;
```

Interpolation works in `sql()`, `sql.prepare()`, `sql.as()` and `sql.fragment()`, alongside `$n`, `:name` and `${sql.param()}`.

- A fragment inside quotes, a dollar-quoted string or a comment is an error.
- Interpolating writes a token into the string that only `sql()` can read. Like a `sql.param()` value, it belongs to one statement. The fragment itself can be interpolated any number of times. To log a fragment's SQL, use `fragment.text`.

A fragment's text is spliced in as it is, without parentheses, so operator precedence applies across the boundary. The fragment `u.email = :e OR u.display_name = :e` in ``WHERE ${f} AND u.id > :min`` becomes `WHERE u.email = $2 OR u.display_name = $2 AND u.id > $1`, where `AND` binds tighter than `OR`. Put parentheses in the fragment (or around it) when it holds `OR`: `sql.fragment("(u.email = :e OR u.display_name = :e)", { e })`.

### Optional pieces

`${flag ? a : b}` is checked once for each member, with its own parameters. `${sql.optional(maybeFragment)}` splices nothing when the fragment is `undefined`, and `${sql.if(value, (v) => fragment)}` builds the fragment only when `value` is truthy. Both are checked with and without the fragment:

```ts
declare const onlyRecent: boolean;
declare const titlePrefix: string | undefined;
const posts = sql(
	`SELECT p.id FROM posts p WHERE p.author_id = $1 ${sql.optional(onlyRecent ? sql.fragment("AND p.id > $1", 100) : undefined)} ${sql.if(titlePrefix, (t) => sql.fragment(`AND p.title LIKE ${sql.param(`${t}%`)}`))}`,
	7,
);
```

### Parameters

A fragment's parameters are renumbered to follow the statement's. Its values come after the statement's own `$n` / `:name` parameters and inline values, in the order the fragments appear:

```ts
const byAuthor = sql(
	`SELECT p.title FROM posts p WHERE p.author_id = $1 ${sql.fragment(`AND p.title <> ${sql.param("draft")}`)}`,
	42,
);
byAuthor.text;
byAuthor.values;
```

The values a fragment carries are checked once it is spliced, whether they came as arguments, a `:name` object or `sql.param()`:

```ts
const wrong = sql.fragment("AND p.author_id = $1", "seven");
sql(`SELECT p.id FROM posts p WHERE true ${wrong}`);
```

Fragments can be reused in any number of statements. Each union member and each distinct list element adds a check, so see [Limits](./limits) for the cost.

To use one statement with different pieces, build it in a function:

```ts
const mine = sql.fragment("p.author_id = $1", 7);
const drafts = sql.fragment("p.title LIKE 'Draft%'");
const titles = (filter: typeof mine | typeof drafts) =>
	sql(`SELECT p.title FROM posts p WHERE ${filter}`);
```

## Queries as subqueries

You can interpolate a whole query too, for example into `IN (…)`:

```ts
const authors = sql(
	"SELECT author_id FROM posts GROUP BY author_id HAVING count(*) >= $1::int4",
	3,
);
const prolific = sql(`SELECT email FROM users WHERE id IN (${authors})`);
```

The outer statement is checked with the subquery's text in place, so a query that already holds fragments or other queries nests to any depth. The subquery's values were checked when it was built and are not checked again.

## Identifiers and lists

- `sql.id(…)` quotes an identifier. `sql.id("schema", "table")` gives `"schema"."table"`.
- `sql.combine([…], { separator })` combines fragments and renumbers their parameters in order.
- `sql.and([…])` and `sql.or([…])` combine conditions in parentheses: `((a) AND (b))`. With no conditions, they give `true` and `false`.

All of them keep their text as a literal type, so the statement is still fully typed:

```ts
const column = sql.id("display_name");
const both = sql.and([
	sql.fragment("u.id > $1", 10),
	sql.fragment(`u.email LIKE ${sql.param("%@example.com")}`),
]);
const listed = sql(`SELECT ${column} FROM users u WHERE ${both}`);
listed.text;
```

::: warning Allowlisting identifier inputs
`sql.id(…)` double-quotes strings to prevent SQL syntax injection, but does not perform application-level authorization or column filtering. Passing untrusted user input directly to `sql.id()` allows callers to specify sensitive columns (such as `password_hash` in an `ORDER BY` or `SELECT`) or query internal tables. Always validate dynamic identifier names against an allowlist before passing them to `sql.id()`.
:::

::: danger Dynamic separators
The `options.separator` value in `sql.combine()` is inserted into the query as **raw SQL text**. Never pass untrusted user input as the separator. Use constant delimiters such as `", "` or `" UNION ALL "`, and `sql.and` or `sql.or` for conditions.
:::

### A name from a union

If the name's type is a union of literals, the fragment's text is a union too. The statement is checked once for each member, and the row type is the union of their rows:

```ts
declare const shown: "email" | "display_name";
const pick = sql.id(shown);
const picked = sql(`SELECT ${pick} FROM users`);

function countRows<T extends RelationName<DB>>(table: T) {
	const t = sql.id(table);
	return sql(`SELECT count(*) AS n FROM ${t}`);
}
```

Inside a generic function, the name isn't known until the call:

- A generic constrained to `RelationName<DB>` (the top-level tables and views) is checked against every relation. The row type is the union of all their rows.
- Any other generic or `string` name gives a dynamic fragment, which needs [`sql.as`](#fully-dynamic-sql).
- To check against a smaller set, narrow the name yourself: `sql.id(name as "users" | "posts")`.

`sql.combine(items)`, `sql.and(items)` and `sql.or(items)` keep the literal text for a tuple written in place. The separator of `sql.combine` defaults to `", "` when options are omitted. An array built at runtime is checked as a list, below.

## Lists from runtime arrays

`sql.combine`, `sql.and` and `sql.or` also combine an array whose length and order are only known at runtime, such as sort keys a user picked. Each element's text must be known at compile time (fragments from a constant table, or `sql.id` over a union of names), so the statement stays checked:

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
const sorted = sql(`SELECT p.id, p.title FROM posts p ORDER BY ${order}`);
```

TypeSQL doesn't try every combination. It checks the statement once, with each distinct element present once. In a list position (`ORDER BY`, `GROUP BY`, `SET`, `VALUES` rows, `IN (…)`, an `AND` or `OR` chain) each element is checked on its own. So if that one statement is valid, every count and order of the elements is valid too.

::: warning Empty arrays
Use `sql.optional(maybeFragment)` to omit a fragment that can be `undefined`; omitted items are ignored. Plain `null` and `undefined` entries are rejected. In `sql.combine`, an empty array, or one containing only omissions, throws at runtime. Always include a fixed element, like the `p.id` tiebreaker above. `sql.and` gives `true` and `sql.or` gives `false` instead, so an empty `sql.and` filter matches every row. For authorization-sensitive queries, keep required tenant or ownership predicates unconditional; an optional filter must never replace them.
:::

- The query's text type (`TextType`) is that one-of-each statement, not the text sent at runtime. At runtime, elements are repeated and renumbered as given.
- Conditional fragments are checked as present, including in tuples. Do not rely on optional predicates to guarantee non-null results.
- In a select list (``SELECT ${cols}``), the row type counts every element as selected, even if only some are at runtime.
- An element whose text is dynamic (`sql.raw`) makes the whole list dynamic.

## Fully dynamic SQL

Sometimes the shape of a statement is only known at runtime: `sql.raw(text)`, or `sql.combine` over an array of fragments whose texts aren't known. TypeSQL can't infer anything then, and interpolating such a fragment into `sql(…)` is a compile error.

Use `sql.as<Row>(…)` instead. It takes the same arguments, skips inference, and lets you state the row type:

```ts
declare const userChosenColumns: string[];
const raw = sql.raw(
	userChosenColumns.map((c) => `"${c.replaceAll('"', '""')}"`).join(", "),
);
const dynamic = sql.as<{ [column: string]: unknown }>(
	`SELECT ${raw} FROM users`,
);
```

::: danger
`sql.raw` text is sent as it is. Never put user input in it.
:::
