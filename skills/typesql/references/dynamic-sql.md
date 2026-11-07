# Dynamic SQL

Build variation from fragments; the finished statement is checked as a whole.

```ts
declare const filter: { author?: number; title?: string };
declare const sortBy: (keyof typeof SORT)[];
const SORT = { title: sql.fragment("p.title"), author: sql.fragment("p.author_id") } as const;

const where = sql.and([
	sql.optional(filter.author === undefined ? undefined : sql.fragment(`p.author_id = ${sql.param(filter.author)}`)),
	sql.if(filter.title, (t) => sql.fragment(`p.title = ${sql.param(t)}`)),
]);
const order = sql.combine([...sortBy.map((f) => SORT[f]), sql.fragment("p.id")]);

const page = sql(`SELECT p.id, p.title FROM posts p WHERE ${where} ORDER BY ${order}`);
const total = sql(`SELECT count(*) AS n FROM posts p WHERE ${where}`); // fragments are reusable
```

- `sql.fragment` adds no parentheses, so add them around `OR`. `sql.and` and `sql.or` add their own, and give `true`/`false` when empty.
- `sql.if(value, fn)` narrows `value`; a falsy value splices nothing, including `0` and `""`.
- `sql.combine` throws when empty, so keep a fixed element.
- `sql.id("col")` quotes a name. Quoting doesn't authorize: map untrusted input through an allowlist.
- Fully dynamic: `` sql.as<Row>(`SELECT ${sql.raw(columns)} FROM users`) ``. Unchecked; never put user input in `sql.raw` or a `combine` separator.
- Cost: a union-typed fragment is checked once per member, and two multiply. An array in `sql.combine` costs one check.
