# Dynamic SQL

This page shows how to build statements from pieces and keep them type-checked. You write a piece once as a **fragment** and splice it into statements through `{name}` slots. Splicing happens before type inference, so the finished statement is checked as a whole.

## Slots

<<< @/snippets/fragments.ts#slots

Only `{identifier}` is a slot. Braces inside string literals, such as `'{1,2}'`, are left alone.

A fragment's parameters are renumbered to follow the statement's. Arguments after the slot object belong to the outer statement:

<<< @/snippets/fragments.ts#outer

The values a fragment carries are checked once it is spliced, whether they came as arguments, a `:name` object or `sql.param()`:

```ts
const wrong = sql.fragment("AND p.author_id = $1", "seven");
sql("SELECT p.id FROM posts p WHERE true {wrong}", { wrong });
// … SqlError<"parameter $1: a string value cannot be used as int4", 14>
```

Fragments can be reused in any number of statements. Each union member and each distinct list element adds a check, so see [Limits](./limits) for the cost.

## Queries as subqueries

You can splice a whole query too, for example into `IN (…)`:

<<< @/snippets/fragments.ts#subquery

## Identifiers and lists

- `sql.id(…)` quotes an identifier. `sql.id("schema", "table")` gives `"schema"."table"`.
- `sql.join([…], separator)` joins fragments and renumbers their parameters in order.

Both keep their text as a literal type, so the statement is still fully typed:

<<< @/snippets/fragments.ts#helpers

::: warning Allowlisting identifier inputs
`sql.id(…)` double-quotes strings to prevent SQL syntax injection, but does not perform application-level authorization or column filtering. Passing untrusted user input directly to `sql.id()` allows callers to specify sensitive columns (such as `password_hash` in an `ORDER BY` or `SELECT`) or query internal tables. Always validate dynamic identifier names against an allowlist before passing them to `sql.id()`.
:::

::: danger Dynamic join separators
The `separator` argument in `sql.join()` is inserted into the query as **raw SQL text**. Never pass untrusted user input as the separator. Use constant delimiters such as `", "`, `" AND "`, or `" OR "`.
:::

### A name from a union

If the name's type is a union of literals, the fragment's text is a union too. The statement is checked once for each member, and the row type is the union of their rows:

<<< @/snippets/fragments.ts#id-union

Inside a generic function, the name isn't known until the call:

- A generic constrained to `RelationName<DB>` (the top-level tables and views) is checked against every relation. The row type is the union of all their rows.
- Any other generic or `string` name gives a dynamic fragment, which needs [`sql.as`](#fully-dynamic-sql).
- To check against a smaller set, narrow the name yourself: `sql.id(name as "users" | "posts")`.

`sql.join(items, separator = ", ")` keeps the literal text for a tuple written in place. An array built at runtime is checked as a list, below.

## Lists from runtime arrays

`sql.join` also joins an array whose length and order are only known at runtime, such as sort keys a user picked. Each element's text must be known at compile time (fragments from a constant table, or `sql.id` over a union of names), so the statement stays checked:

<<< @/snippets/fragments.ts#list

TypeSQL doesn't try every combination. It checks the statement once, with each distinct element present once. In a list position (`ORDER BY`, `GROUP BY`, `SET`, `VALUES` rows, `IN (…)`, an `AND` chain) each element is checked on its own. So if that one statement is valid, every count and order of the elements is valid too.

::: warning Empty arrays
An empty array throws at runtime. Always include a fixed element, like the `p.id` tiebreaker above, or start an `AND` chain with `sql.fragment("true")`.
:::

- The query's text type (`TextType`) is that one-of-each statement, not the text sent at runtime. At runtime, elements are repeated and renumbered as given.
- In a select list (`SELECT {cols}`), the row type counts every element as selected, even if only some are at runtime.
- An element whose text is dynamic (`sql.raw`) makes the whole list dynamic.

## Fully dynamic SQL

Sometimes the shape of a statement is only known at runtime: `sql.raw(text)`, or `sql.join` over an array of fragments whose texts aren't known. TypeSQL can't infer anything then, and splicing such a fragment into `sql(…)` is a compile error.

Use `sql.as<Row>(…)` instead. It takes the same arguments, skips inference, and lets you state the row type:

<<< @/snippets/fragments.ts#dynamic

::: danger
`sql.raw` text is sent as it is. Never put user input in it.
:::
