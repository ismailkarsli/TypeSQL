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
runtime gives a fragment whose text is not known at compile time.

## Dynamic SQL

When the shape of a statement is only known at runtime (`sql.raw(text)`, or `sql.join` over an
array), typesql cannot infer anything, and splicing such a fragment into `sql(…)` is a compile
error. Use `sql.as<Row>(…)`, which accepts the same arguments, skips inference and lets you
state the row type:

<<< @/snippets/fragments.ts#dynamic

`sql.raw` text is sent as is; never put user input in it.
