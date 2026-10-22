# Fragments

A fragment is a piece of SQL you build once and splice into statements through `{name}`
slots. Splicing happens before inference, so the finished statement is checked as a whole and
the fragment's parameters get their types from where they end up.

## Slots

<<< @/snippets/fragments.ts#slots

Only `{identifier}` is a slot; braces inside string literals, such as `'{1,2}'`, are left
alone.

A fragment's own parameters are renumbered to follow the statement's. Arguments passed after
the slot object belong to the outer statement:

<<< @/snippets/fragments.ts#outer

The values a fragment carries are type-checked once it is spliced, whether they were passed as
arguments, `:name` objects or `sql.param()`:

```ts
const wrong = sql.fragment("AND p.author_id = $1", "seven");
sql("SELECT p.id FROM posts p WHERE true {wrong}", { wrong });
// … SqlError<"parameter $1: a string value cannot be used as int4", 14>
```

## Queries as subqueries

A whole query can be spliced as well, for example into `IN (…)`:

<<< @/snippets/fragments.ts#subquery

## Identifiers and lists

`sql.id(…)` quotes an identifier (`sql.id("schema", "table")` gives `"schema"."table"`), and
`sql.join([…], separator)` joins fragments, renumbering their parameters in order. Both keep
their text as a literal type, so the statement is still fully typed:

<<< @/snippets/fragments.ts#helpers

`sql.join` keeps the literal text only for a tuple written in place. Joining an array built at
runtime gives a fragment whose text is not known at compile time; use `sql.list` for that.

## Lists from runtime arrays

`sql.list(items, separator = ", ")` joins an array whose length and order are only known at
runtime, such as user-chosen sort keys. Each element's text must be known at compile time
(fragments picked from a constant table, `sql.id` over a union of names), so the statement
stays checked:

<<< @/snippets/fragments.ts#list

typesql does not try every combination. It checks the statement once, with each distinct
element present once in the list, in TypeScript's union order. In a list position (`ORDER BY`,
`GROUP BY`, `SET`, `VALUES` rows, `IN (…)`, an `AND` chain) each element is checked on its own,
so if that statement is valid, every count and order of the elements is valid too. Every
element's columns are checked against the scope, and the values each element carries are
checked against the types they get there.

- The query's text type (`TextType`) is that one-of-each statement, not the text sent at
  runtime. The runtime text repeats and renumbers elements as given.
- In a select list (`SELECT {cols}`), the row type counts every element as selected, even
  though at runtime only some may be.
- An empty array throws at runtime. Put a fixed element first (`[base, ...rest]`), as with the
  `p.id` tiebreaker above, or use `sql.fragment("true")` first in an `AND` chain.
- An element whose text is dynamic (`sql.raw`) makes the whole list dynamic.

## Dynamic SQL

When the shape of a statement is only known at runtime (`sql.raw(text)`, or `sql.join` over an
array), typesql cannot infer anything, and splicing such a fragment into `sql(…)` is a compile
error. Use `sql.as<Row>(…)`, which accepts the same arguments, skips inference and lets you
state the row type:

<<< @/snippets/fragments.ts#dynamic

`sql.raw` text is sent as is; never put user input in it.
