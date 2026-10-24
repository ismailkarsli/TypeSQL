import fc from "fast-check";
import { MOOD, type SqlType, TABLES } from "./schema.js";

export interface Node {
	readonly k: string;
	readonly sql: string;
	readonly c: readonly Node[];
}

const n = (k: string, sql: string, ...c: Node[]): Node => ({ k, sql, c });

interface Ref {
	readonly sql: string;
	readonly type: SqlType;
}

interface Ctx {
	readonly cols: readonly Ref[];
	/** Grouped: plain column references must be group keys; aggregates over `cols`. */
	readonly keys: readonly Ref[] | null;
	readonly depth: number;
	readonly aggs: boolean;
	readonly windows: boolean;
	readonly level: number;
}

const TYPES: readonly SqlType[] = [
	"int4",
	"int8",
	"numeric",
	"float8",
	"text",
	"bool",
	"timestamptz",
	"date",
	"jsonb",
	"mood",
	"int4[]",
];
const NUMERIC: readonly SqlType[] = ["int4", "int8", "numeric", "float8"];
const ORDERABLE: readonly SqlType[] = [
	"int4",
	"int8",
	"numeric",
	"float8",
	"text",
	"timestamptz",
	"date",
	"mood",
];

const LITERALS: { readonly [T in SqlType]: readonly string[] } = {
	int4: ["0", "1", "2", "-1"],
	int8: ["0::int8", "10::int8"],
	numeric: ["1.5", "0::numeric"],
	float8: ["1.5::float8", "0::float8"],
	text: ["'a'", "''", "'abc'"],
	bool: ["true", "false"],
	timestamptz: ["'2000-01-01 00:00:00+00'::timestamptz"],
	date: ["'2000-01-01'::date"],
	jsonb: [`'{"a":1}'::jsonb`, `'null'::jsonb`, `'[]'::jsonb`],
	mood: MOOD.map((m) => `'${m}'::mood`),
	"int4[]": ["ARRAY[1, 2]", "'{}'::int4[]"],
};

const pick = <T>(xs: readonly T[]): fc.Arbitrary<T> => fc.constantFrom(...xs);

function leaf(t: SqlType, ctx: Ctx): fc.Arbitrary<Node> {
	const refs = (ctx.keys ?? ctx.cols).filter((r) => r.type === t);
	const options: fc.WeightedArbitrary<Node>[] = [
		{ arbitrary: pick(LITERALS[t]).map((v) => n("lit", v)), weight: 2 },
		{ arbitrary: fc.constant(n("null", `NULL::${t}`)), weight: 1 },
		{ arbitrary: fc.constant(n("param", `$?::${t}`)), weight: 1 },
	];
	if (refs.length)
		options.push({
			arbitrary: pick(refs).map((r) => n("col", r.sql)),
			weight: 8,
		});
	return fc.oneof(...options);
}

export function expr(t: SqlType, ctx: Ctx): fc.Arbitrary<Node> {
	if (ctx.depth <= 0) return leaf(t, ctx);
	const d: Ctx = { ...ctx, depth: ctx.depth - 1 };
	// an aggregate's arguments see every column of the group
	const plain: Ctx = { ...d, keys: null, aggs: false, windows: false };
	const options: fc.WeightedArbitrary<Node>[] = [
		{ arbitrary: leaf(t, ctx), weight: 6 },
	];
	const add = (weight: number, arbitrary: fc.Arbitrary<Node>): void =>
		void options.push({ arbitrary, weight });

	add(
		2,
		fc
			.array(expr(t, d), { minLength: 1, maxLength: 3 })
			.map((as) =>
				n("coalesce", `coalesce(${as.map((a) => a.sql).join(", ")})`, ...as),
			),
	);
	if (t !== "jsonb" && t !== "int4[]")
		add(
			1,
			fc
				.tuple(expr(t, d), expr(t, d))
				.map(([a, b]) => n("nullif", `nullif(${a.sql}, ${b.sql})`, a, b)),
		);
	add(
		2,
		fc
			.tuple(cond(d), expr(t, d), fc.option(expr(t, d), { nil: null }))
			.map(([c, a, e]) =>
				n(
					e ? "case-else" : "case",
					`CASE WHEN ${c.sql} THEN ${a.sql}${e ? ` ELSE ${e.sql}` : ""} END`,
					c,
					a,
					...(e ? [e] : []),
				),
			),
	);
	if (ctx.level < 2) add(1, scalarSubquery(t, d));
	if (ORDERABLE.includes(t))
		add(
			1,
			fc
				.tuple(expr(t, d), expr(t, d), fc.boolean())
				.map(([a, b, g]) =>
					n(
						g ? "greatest" : "least",
						`${g ? "greatest" : "least"}(${a.sql}, ${b.sql})`,
						a,
						b,
					),
				),
		);

	switch (t) {
		case "int4":
			add(
				2,
				fc
					.tuple(expr("int4", d), pick(["+", "-", "*"]), expr("int4", d))
					.map(([a, op, b]) => n("arith", `(${a.sql} ${op} ${b.sql})`, a, b)),
			);
			add(
				1,
				expr("text", d).map((a) => n("length", `length(${a.sql})`, a)),
			);
			add(
				1,
				expr("int4[]", d).map((a) =>
					n("array_length", `array_length(${a.sql}, 1)`, a),
				),
			);
			break;
		case "int8":
			add(
				1,
				expr("int4", d).map((a) => n("cast", `${a.sql}::int8`, a)),
			);
			if (ctx.aggs)
				add(
					3,
					fc
						.oneof(
							fc.constant(n("count-star", "count(*)")),
							anyExpr(plain).map((a) => n("count", `count(${a.sql})`, a)),
							expr("int4", plain).map((a) => n("sum", `sum(${a.sql})`, a)),
						)
						.chain((a) => filtered(a, plain)),
				);
			if (ctx.windows) add(2, windowed(n("row_number", "row_number()"), d));
			break;
		case "numeric":
			add(
				1,
				fc
					.tuple(expr("numeric", d), expr("numeric", d))
					.map(([a, b]) => n("arith", `(${a.sql} + ${b.sql})`, a, b)),
			);
			if (ctx.aggs)
				add(
					3,
					fc
						.oneof(
							expr("int8", plain).map((a) => n("sum", `sum(${a.sql})`, a)),
							pick(NUMERIC)
								.chain((nt) => expr(nt, plain))
								.map((a) => n("avg", `avg(${a.sql})`, a)),
						)
						.chain((a) => filtered(a, plain)),
				);
			break;
		case "float8":
			add(
				1,
				expr("int4", d).map((a) => n("cast", `${a.sql}::float8`, a)),
			);
			if (ctx.aggs)
				add(
					2,
					fc
						.tuple(
							pick(["stddev", "variance", "stddev_pop", "corr"]),
							expr("float8", plain),
							expr("float8", plain),
						)
						.map(([f, a, b]) =>
							f === "corr"
								? n(f, `corr(${a.sql}, ${b.sql})`, a, b)
								: n(f, `${f}(${a.sql})`, a),
						)
						.chain((a) => filtered(a, plain)),
				);
			break;
		case "text":
			add(
				2,
				fc
					.tuple(expr("text", d), expr("text", d))
					.map(([a, b]) => n("concat-op", `(${a.sql} || ${b.sql})`, a, b)),
			);
			add(
				1,
				fc
					.tuple(expr("text", d), anyExpr(d))
					.map(([a, b]) => n("concat", `concat(${a.sql}, ${b.sql})`, a, b)),
			);
			add(
				1,
				fc
					.tuple(pick(["lower", "upper"]), expr("text", d))
					.map(([f, a]) => n(f, `${f}(${a.sql})`, a)),
			);
			add(
				1,
				expr("jsonb", d).map((a) => n("json-text", `(${a.sql} ->> 'a')`, a)),
			);
			add(
				1,
				expr("mood", d).map((a) => n("cast", `${a.sql}::text`, a)),
			);
			if (ctx.aggs)
				add(
					2,
					expr("text", plain)
						.map((a) => n("string_agg", `string_agg(${a.sql}, ',')`, a))
						.chain((a) => filtered(a, plain)),
				);
			break;
		case "bool":
			add(6, cond(d));
			if (ctx.aggs)
				add(
					1,
					cond(plain)
						.map((a) => n("bool_and", `bool_and(${a.sql})`, a))
						.chain((a) => filtered(a, plain)),
				);
			break;
		case "timestamptz":
			add(
				1,
				expr("timestamptz", d).map((a) =>
					n("interval-add", `(${a.sql} + interval '1 day')`, a),
				),
			);
			add(
				1,
				expr("timestamptz", d).map((a) =>
					n("date_trunc", `date_trunc('day', ${a.sql})`, a),
				),
			);
			break;
		case "date":
			add(
				1,
				expr("timestamptz", d).map((a) => n("cast", `${a.sql}::date`, a)),
			);
			break;
		case "jsonb":
			add(
				2,
				expr("jsonb", d).map((a) => n("json-get", `(${a.sql} -> 'a')`, a)),
			);
			add(
				2,
				anyExpr(d).map((a) =>
					n("jsonb_build_object", `jsonb_build_object('k', ${a.sql})`, a),
				),
			);
			add(
				1,
				anyExpr(d).map((a) => n("to_jsonb", `to_jsonb(${a.sql})`, a)),
			);
			if (ctx.aggs)
				add(
					2,
					anyExpr(plain)
						.map((a) => n("jsonb_agg", `jsonb_agg(${a.sql})`, a))
						.chain((a) => filtered(a, plain)),
				);
			break;
		case "int4[]":
			add(
				1,
				fc
					.tuple(expr("int4", d), expr("int4", d))
					.map(([a, b]) => n("array", `ARRAY[${a.sql}, ${b.sql}]`, a, b)),
			);
			if (ctx.aggs)
				add(
					2,
					expr("int4", plain)
						.map((a) => n("array_agg", `array_agg(${a.sql})`, a))
						.chain((a) => filtered(a, plain)),
				);
			break;
		default:
			break;
	}
	if (ctx.aggs && ORDERABLE.includes(t))
		add(
			2,
			fc
				.tuple(pick(["min", "max"]), expr(t, plain))
				.map(([f, a]) => n(f, `${f}(${a.sql})`, a))
				.chain((a) => filtered(a, plain)),
		);
	if (ctx.windows && t !== "bool") {
		add(
			1,
			expr(t, plain).chain((a) => windowed(n("lag", `lag(${a.sql})`, a), d)),
		);
		add(
			1,
			expr(t, plain).chain((a) =>
				windowed(n("first_value", `first_value(${a.sql})`, a), d, true),
			),
		);
		if (NUMERIC.includes(t) && t !== "int4")
			add(
				1,
				expr(t === "int8" ? "int4" : t, plain).chain((a) =>
					windowed(n("sum", `sum(${a.sql})`, a), d, true),
				),
			);
	}
	return fc.oneof(...options);
}

const anyExpr = (ctx: Ctx): fc.Arbitrary<Node> =>
	pick(TYPES).chain((t) => expr(t, ctx));

function filtered(a: Node, ctx: Ctx): fc.Arbitrary<Node> {
	return fc
		.option(cond({ ...ctx, depth: Math.min(ctx.depth, 1) }), {
			nil: null,
			freq: 3,
		})
		.map((f) =>
			f ? n("filter", `${a.sql} FILTER (WHERE ${f.sql})`, a, f) : a,
		);
}

function windowed(f: Node, ctx: Ctx, frame = false): fc.Arbitrary<Node> {
	const plain: Ctx = { ...ctx, depth: 0, aggs: false, windows: false };
	return fc
		.tuple(
			fc.option(anyOrderable(plain), { nil: null }),
			anyOrderable(plain),
			frame
				? fc.option(
						pick([
							"ROWS BETWEEN 1 PRECEDING AND CURRENT ROW",
							"ROWS BETWEEN CURRENT ROW AND 1 FOLLOWING",
							"RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW",
						]),
						{ nil: null },
					)
				: fc.constant(null),
		)
		.map(([p, o, fr]) =>
			n(
				fr ? "window-frame" : "window",
				`${f.sql} OVER (${p ? `PARTITION BY ${p.sql} ` : ""}ORDER BY ${o.sql}${fr ? ` ${fr}` : ""})`,
				f,
				...(p ? [p] : []),
				o,
			),
		);
}

const anyOrderable = (ctx: Ctx): fc.Arbitrary<Node> =>
	pick(ORDERABLE).chain((t) => expr(t, ctx));

export function cond(ctx: Ctx): fc.Arbitrary<Node> {
	const d: Ctx = {
		...ctx,
		depth: Math.max(0, ctx.depth - 1),
		aggs: ctx.aggs,
		windows: false,
	};
	const options: fc.WeightedArbitrary<Node>[] = [];
	const add = (weight: number, arbitrary: fc.Arbitrary<Node>): void =>
		void options.push({ arbitrary, weight });
	add(
		3,
		fc
			.tuple(anyExpr(d), fc.boolean())
			.map(([a, not]) =>
				n(
					not ? "is-not-null" : "is-null",
					`${a.sql} IS ${not ? "NOT " : ""}NULL`,
					a,
				),
			),
	);
	add(
		4,
		pick(ORDERABLE)
			.chain((t) =>
				fc.tuple(expr(t, d), pick(["=", "<>", "<", ">="]), expr(t, d)),
			)
			.map(([a, op, b]) => n("compare", `${a.sql} ${op} ${b.sql}`, a, b)),
	);
	add(
		2,
		pick(ORDERABLE)
			.chain((t) =>
				fc.tuple(
					expr(t, d),
					expr(t, d),
					expr(t, d),
					fc.boolean(),
					fc.boolean(),
				),
			)
			.map(([a, lo, hi, not, sym]) =>
				n(
					not ? "not-between" : "between",
					`${a.sql} ${not ? "NOT " : ""}BETWEEN ${sym ? "SYMMETRIC " : ""}${lo.sql} AND ${hi.sql}`,
					a,
					lo,
					hi,
				),
			),
	);
	add(
		2,
		pick(ORDERABLE)
			.chain((t) =>
				fc.tuple(
					expr(t, d),
					fc.array(expr(t, d), { minLength: 1, maxLength: 3 }),
					fc.boolean(),
				),
			)
			.map(([a, l, not]) =>
				n(
					not ? "not-in" : "in",
					`${a.sql} ${not ? "NOT " : ""}IN (${l.map((x) => x.sql).join(", ")})`,
					a,
					...l,
				),
			),
	);
	add(
		1,
		fc
			.tuple(expr("text", d), pick(["'a%'", "'%'", "''"]), fc.boolean())
			.map(([a, p, not]) =>
				n("like", `${a.sql} ${not ? "NOT " : ""}LIKE ${p}`, a),
			),
	);
	add(
		1,
		fc
			.tuple(expr("bool", d), pick(["TRUE", "FALSE", "UNKNOWN"]), fc.boolean())
			.map(([a, w, not]) =>
				n("is-bool", `(${a.sql}) IS ${not ? "NOT " : ""}${w}`, a),
			),
	);
	add(
		1,
		pick(ORDERABLE)
			.chain((t) => fc.tuple(expr(t, d), expr(t, d)))
			.map(([a, b]) =>
				n("distinct-from", `${a.sql} IS DISTINCT FROM ${b.sql}`, a, b),
			),
	);
	if (ctx.depth > 0) {
		add(
			3,
			fc
				.tuple(cond(d), pick(["AND", "OR"]), cond(d))
				.map(([a, op, b]) =>
					n(op.toLowerCase(), `(${a.sql} ${op} ${b.sql})`, a, b),
				),
		);
		add(
			1,
			cond(d).map((a) => n("not", `NOT (${a.sql})`, a)),
		);
		if (ctx.level < 2) {
			add(
				1,
				fc
					.tuple(subquery(inner(d), null), fc.boolean())
					.map(([q, not]) =>
						n(
							not ? "not-exists" : "exists",
							`${not ? "NOT " : ""}EXISTS (${q.sql})`,
							q,
						),
					),
			);
			add(
				1,
				pick(ORDERABLE)
					.chain((t) =>
						fc.tuple(expr(t, d), subquery(inner(d), [t]), fc.boolean()),
					)
					.map(([a, q, not]) =>
						n(
							not ? "not-in-subquery" : "in-subquery",
							`${a.sql} ${not ? "NOT " : ""}IN (${q.sql})`,
							a,
							q,
						),
					),
			);
		}
	}
	return fc.oneof(...options);
}

function scalarSubquery(t: SqlType, ctx: Ctx): fc.Arbitrary<Node> {
	return subquery(inner(ctx), [t]).map((q) =>
		n("scalar-subquery", `(${q.sql} LIMIT 1)`, q),
	);
}

const inner = (ctx: Ctx): Ctx => ({
	...ctx,
	cols: ctx.keys ?? ctx.cols,
	keys: null,
	aggs: false,
	windows: false,
	level: ctx.level + 1,
});

interface From {
	readonly node: Node;
	readonly cols: readonly Ref[];
	readonly items: readonly {
		alias: string;
		cols: readonly { name: string; type: SqlType }[];
	}[];
}

function tableItem(alias: string): fc.Arbitrary<From> {
	return pick(TABLES).map((t) => ({
		node: n("table", `${t.name} ${alias}`),
		cols: t.columns.map((c) => ({ sql: `${alias}.${c.name}`, type: c.type })),
		items: [
			{ alias, cols: t.columns.map((c) => ({ name: c.name, type: c.type })) },
		],
	}));
}

function fromItem(
	alias: string,
	ctx: Ctx,
	lateral: readonly Ref[],
): fc.Arbitrary<From> {
	const options: fc.WeightedArbitrary<From>[] = [
		{ arbitrary: tableItem(alias), weight: 8 },
	];
	options.push({
		arbitrary: pick(["generate_series(1, 3)", "generate_series(0, -1)"]).map(
			(f) => ({
				node: n("srf", `${f} AS ${alias}(v)`),
				cols: [{ sql: `${alias}.v`, type: "int4" as const }],
				items: [{ alias, cols: [{ name: "v", type: "int4" as const }] }],
			}),
		),
		weight: 1,
	});
	options.push({
		arbitrary: fc.constant({
			node: n("values", `(VALUES (1, NULL::text), (2, 'a')) ${alias}(v, s)`),
			cols: [
				{ sql: `${alias}.v`, type: "int4" as const },
				{ sql: `${alias}.s`, type: "text" as const },
			],
			items: [
				{
					alias,
					cols: [
						{ name: "v", type: "int4" as const },
						{ name: "s", type: "text" as const },
					],
				},
			],
		}),
		weight: 1,
	});
	if (ctx.level < 2) {
		options.push({
			arbitrary: fc
				.tuple(
					fc.boolean(),
					fc.array(pick(TYPES), { minLength: 1, maxLength: 3 }),
				)
				.chain(([lat, shape]) =>
					subquery(
						{
							...ctx,
							cols: lat ? lateral : ctx.cols,
							level: ctx.level + 1,
							keys: null,
							aggs: false,
							windows: false,
						},
						shape,
					).map((q) => {
						const cols = shape.map((t, i) => ({ name: `c${i + 1}`, type: t }));
						return {
							node: n(
								lat && lateral.length ? "lateral" : "derived",
								`${lat && lateral.length ? "LATERAL " : ""}(${q.sql}) ${alias}`,
								q,
							),
							cols: cols.map((c) => ({
								sql: `${alias}.${c.name}`,
								type: c.type,
							})),
							items: [{ alias, cols }],
						};
					}),
				),
			weight: 2,
		});
	}
	return fc.oneof(...options);
}

function fromClause(ctx: Ctx): fc.Arbitrary<From> {
	const a = (i: number): string => `x${ctx.level}${i}`;
	return fc.integer({ min: 1, max: 3 }).chain((count) => {
		let acc: fc.Arbitrary<From> = fromItem(a(0), ctx, []);
		for (let i = 1; i < count; i++) {
			acc = acc.chain((left) =>
				fc
					.tuple(
						fromItem(a(i), ctx, left.cols),
						pick([
							"JOIN",
							"LEFT JOIN",
							"RIGHT JOIN",
							"FULL JOIN",
							"CROSS JOIN",
							"JOIN",
						]),
					)
					.chain(([right, kind]) => join(left, right, kind, ctx)),
			);
		}
		return acc;
	});
}

function join(
	left: From,
	right: From,
	kind: string,
	ctx: Ctx,
): fc.Arbitrary<From> {
	const both: From = {
		node: left.node,
		cols: [...left.cols, ...right.cols],
		items: [...left.items, ...right.items],
	};
	const made = (k: string, sql: string, extra: readonly Ref[] = []): From => ({
		node: n(k, sql, left.node, right.node),
		cols: [...extra, ...both.cols],
		items: both.items,
	});
	if (kind === "CROSS JOIN")
		return fc.constant(
			made("cross-join", `${left.node.sql} CROSS JOIN ${right.node.sql}`),
		);
	const k = kind.split(" ")[0]!.toLowerCase();
	const l = left.items.at(-1)!;
	const r = right.items[0]!;
	const shared = l.cols
		.filter((c) => r.cols.some((d) => d.name === c.name && d.type === c.type))
		.map((c) => c.name);
	const sameNames = l.cols
		.filter((c) => r.cols.some((d) => d.name === c.name))
		.every((c) => shared.includes(c.name));
	const options: fc.Arbitrary<From>[] = [
		cond({
			...ctx,
			cols: both.cols,
			keys: null,
			aggs: false,
			windows: false,
			depth: 1,
		}).map((on) =>
			made(
				`${k}-join-on`,
				`${left.node.sql} ${kind} ${right.node.sql} ON ${on.sql}`,
			),
		),
	];
	// with one item on the left, merged USING columns are bare names; with more, they could be ambiguous
	if (shared.length && left.items.length === 1) {
		options.push(
			fc.subarray(shared, { minLength: 1 }).map((us) =>
				made(
					`${k}-join-using`,
					`${left.node.sql} ${kind} ${right.node.sql} USING (${us.join(", ")})`,
					us.map((u) => ({
						sql: u,
						type: l.cols.find((c) => c.name === u)!.type,
					})),
				),
			),
		);
		if (sameNames)
			options.push(
				fc.constant(
					made(
						`${k}-join-natural`,
						`${left.node.sql} NATURAL ${kind} ${right.node.sql}`,
						shared.map((u) => ({
							sql: u,
							type: l.cols.find((c) => c.name === u)!.type,
						})),
					),
				),
			);
	}
	return fc.oneof(...options);
}

export function subquery(
	ctx: Ctx,
	shape: readonly SqlType[] | null,
): fc.Arbitrary<Node> {
	return fromClause(ctx).chain((from) => {
		const cols = [...from.cols, ...ctx.cols];
		const inner: Ctx = {
			cols,
			keys: null,
			depth: Math.min(ctx.depth, 2),
			aggs: false,
			windows: false,
			level: ctx.level,
		};
		const types = shape
			? fc.constant(shape)
			: fc.array(pick(TYPES), { minLength: 1, maxLength: 3 });
		return fc
			.tuple(types, fc.option(cond({ ...inner, depth: 2 }), { nil: null }))
			.chain(([ts, where]) =>
				fc
					.tuple(...ts.map((t) => expr(t, inner)))
					.map((items) =>
						n(
							"select",
							`SELECT ${items.map((e, i) => `${e.sql} AS c${i + 1}`).join(", ")} FROM ${from.node.sql}${where ? ` WHERE ${where.sql}` : ""}`,
							from.node,
							...items,
							...(where ? [where] : []),
						),
					),
			);
	});
}

function select(depth: number): fc.Arbitrary<Node> {
	const top: Ctx = {
		cols: [],
		keys: null,
		depth,
		aggs: false,
		windows: false,
		level: 0,
	};
	return fromClause(top).chain((from) => {
		const base: Ctx = { ...top, cols: from.cols };
		return fc.oneof(
			{ weight: 5, arbitrary: plainSelect(from, base) },
			{ weight: 3, arbitrary: groupedSelect(from, base) },
			{ weight: 1, arbitrary: starSelect(from, base) },
		);
	});
}

function plainSelect(from: From, ctx: Ctx): fc.Arbitrary<Node> {
	const items: Ctx = { ...ctx, windows: true };
	return fc
		.tuple(
			fc.array(anyExpr(items), { minLength: 1, maxLength: 4 }),
			fc.option(cond({ ...ctx, depth: 3 }), { nil: null }),
			fc.boolean(),
			fc.option(fc.integer({ min: 0, max: 3 }), { nil: null }),
		)
		.map(([es, where, distinct, limit]) =>
			n(
				distinct ? "select-distinct" : "select",
				`SELECT ${distinct ? "DISTINCT " : ""}${es.map((e, i) => `${e.sql} AS c${i + 1}`).join(", ")} FROM ${from.node.sql}${where ? ` WHERE ${where.sql}` : ""}${limit !== null ? ` ORDER BY 1 LIMIT ${limit}` : ""}`,
				from.node,
				...es,
				...(where ? [where] : []),
			),
		);
}

function groupedSelect(from: From, ctx: Ctx): fc.Arbitrary<Node> {
	const orderable = from.cols.filter((c) => c.type !== "jsonb");
	if (!orderable.length) return plainSelect(from, ctx);
	return fc
		.tuple(
			fc.subarray(orderable, {
				minLength: 1,
				maxLength: Math.min(2, orderable.length),
			}),
			pick([
				"GROUP BY",
				"GROUP BY ROLLUP",
				"GROUP BY CUBE",
				"GROUP BY GROUPING SETS",
				"",
				"GROUP BY",
			]),
		)
		.chain(([keys, how]) => {
			const g: Ctx = { ...ctx, keys: how ? keys : [], aggs: true, depth: 2 };
			const groupSql = !how
				? ""
				: how === "GROUP BY"
					? ` GROUP BY ${keys.map((k) => k.sql).join(", ")}`
					: how === "GROUP BY GROUPING SETS"
						? ` GROUP BY GROUPING SETS ((${keys.map((k) => k.sql).join(", ")}), ())`
						: ` ${how} (${keys.map((k) => k.sql).join(", ")})`;
			return fc
				.tuple(
					fc.array(anyExpr(g), { minLength: 1, maxLength: 4 }),
					fc.option(cond({ ...ctx, depth: 2 }), { nil: null }),
					fc.option(cond({ ...g, depth: 1 }), { nil: null, freq: 4 }),
				)
				.map(([es, where, having]) =>
					n(
						how ? how.toLowerCase().replace(/ /g, "-") : "aggregate",
						`SELECT ${es.map((e, i) => `${e.sql} AS c${i + 1}`).join(", ")} FROM ${from.node.sql}${where ? ` WHERE ${where.sql}` : ""}${groupSql}${having ? ` HAVING ${having.sql}` : ""}`,
						from.node,
						...es,
						...(where ? [where] : []),
						...(having ? [having] : []),
					),
				);
		});
}

function starSelect(from: From, ctx: Ctx): fc.Arbitrary<Node> {
	return fc
		.tuple(
			fc.option(pick(from.items.map((i) => i.alias)), { nil: null }),
			fc.option(cond({ ...ctx, depth: 2 }), { nil: null }),
		)
		.map(([alias, where]) =>
			n(
				alias ? "alias-star" : "star",
				`SELECT ${alias ? `${alias}.*` : "*"} FROM ${from.node.sql}${where ? ` WHERE ${where.sql}` : ""}`,
				from.node,
				...(where ? [where] : []),
			),
		);
}

function setOperation(depth: number): fc.Arbitrary<Node> {
	const ctx: Ctx = {
		cols: [],
		keys: null,
		depth,
		aggs: false,
		windows: false,
		level: 0,
	};
	return fc
		.tuple(
			fc.array(pick(TYPES.filter((t) => t !== "jsonb")), {
				minLength: 1,
				maxLength: 3,
			}),
			pick(["UNION", "UNION ALL", "INTERSECT", "EXCEPT", "EXCEPT ALL"]),
		)
		.chain(([shape, op]) =>
			fc
				.tuple(subquery(ctx, shape), subquery(ctx, shape))
				.map(([a, b]) =>
					n(
						`setop-${op.toLowerCase().replace(" ", "-")}`,
						`${a.sql} ${op} ${b.sql}`,
						a,
						b,
					),
				),
		);
}

function withQuery(depth: number): fc.Arbitrary<Node> {
	const ctx: Ctx = {
		cols: [],
		keys: null,
		depth,
		aggs: false,
		windows: false,
		level: 1,
	};
	const plain = fc
		.array(pick(TYPES), { minLength: 1, maxLength: 3 })
		.chain((shape) =>
			subquery(ctx, shape).chain((q) => {
				const cols = shape.map((t, i) => ({ sql: `w.c${i + 1}`, type: t }));
				const outer: Ctx = { ...ctx, cols, level: 0 };
				return fc
					.tuple(
						fc.array(anyExpr(outer), { minLength: 1, maxLength: 3 }),
						fc.option(cond({ ...outer, depth: 2 }), { nil: null }),
					)
					.map(([es, where]) =>
						n(
							"cte",
							`WITH w AS (${q.sql}) SELECT ${es.map((e, i) => `${e.sql} AS r${i + 1}`).join(", ")} FROM w${where ? ` WHERE ${where.sql}` : ""}`,
							q,
							...es,
							...(where ? [where] : []),
						),
					);
			}),
		);
	const recursive = fc
		.tuple(
			expr("text", { ...ctx, cols: [], depth: 1 }),
			expr("text", {
				...ctx,
				cols: [
					{ sql: "r.s", type: "text" },
					{ sql: "r.n", type: "int4" },
				],
				depth: 1,
			}),
		)
		.map(([a, b]) =>
			n(
				"recursive-cte",
				`WITH RECURSIVE r(n, s) AS (SELECT 1, ${a.sql} UNION ALL SELECT n + 1, ${b.sql} FROM r WHERE n < 3) SELECT n, s FROM r`,
				a,
				b,
			),
		);
	return fc.oneof(
		{ weight: 3, arbitrary: plain },
		{ weight: 1, arbitrary: recursive },
	);
}

function dml(depth: number): fc.Arbitrary<Node> {
	const ctx: Ctx = {
		cols: [],
		keys: null,
		depth,
		aggs: false,
		windows: false,
		level: 1,
	};
	const t5 = TABLES.find((t) => t.name === "t5")!;
	const t1 = TABLES.find((t) => t.name === "t1")!;
	const t1cols = t1.columns.map((c) => ({ sql: `u.${c.name}`, type: c.type }));
	const returning = (cols: readonly Ref[]): fc.Arbitrary<Node> =>
		fc.oneof(
			fc.constant(n("returning-star", "*")),
			fc
				.array(anyExpr({ ...ctx, cols, level: 0, depth: 1 }), {
					minLength: 1,
					maxLength: 3,
				})
				.map((es) =>
					n(
						"returning",
						es.map((e, i) => `${e.sql} AS r${i + 1}`).join(", "),
						...es,
					),
				),
		);
	const insert = fc
		.tuple(
			expr("text", { ...ctx, depth: 1 }),
			expr("int4", { ...ctx, depth: 1 }),
			returning(t5.columns.map((c) => ({ sql: `t5.${c.name}`, type: c.type }))),
		)
		.map(([k, v, r]) =>
			n(
				"insert",
				`INSERT INTO t5 (k, v) VALUES (coalesce(${k.sql}, 'k'), ${v.sql}) RETURNING ${r.sql}`,
				k,
				v,
				r,
			),
		);
	const update = fc
		.tuple(
			expr("text", { ...ctx, cols: t1cols, depth: 1 }),
			fc.option(cond({ ...ctx, cols: t1cols, depth: 2 }), { nil: null }),
			returning(t1cols),
		)
		.map(([c, where, r]) =>
			n(
				"update",
				`UPDATE t1 u SET c = ${c.sql}${where ? ` WHERE ${where.sql}` : ""} RETURNING ${r.sql}`,
				c,
				...(where ? [where] : []),
				r,
			),
		);
	const t2cols = TABLES.find((t) => t.name === "t2")!.columns.map((c) => ({
		sql: `t2.${c.name}`,
		type: c.type,
	}));
	const del = fc
		.tuple(
			fc.option(cond({ ...ctx, cols: t2cols, depth: 2 }), { nil: null }),
			returning(t2cols),
		)
		.map(([where, r]) =>
			n(
				"delete",
				`DELETE FROM t2${where ? ` WHERE ${where.sql}` : ""} RETURNING ${r.sql}`,
				...(where ? [where] : []),
				r,
			),
		);
	return fc.oneof(insert, update, del);
}

export function statement(depth = 3): fc.Arbitrary<Node> {
	return fc
		.oneof(
			{ weight: 10, arbitrary: select(depth) },
			{ weight: 2, arbitrary: setOperation(depth) },
			{ weight: 2, arbitrary: withQuery(depth) },
			{ weight: 2, arbitrary: dml(depth) },
		)
		.map(numberParams);
}

export function numberParams(s: Node): Node {
	let k = 0;
	return { ...s, sql: s.sql.replace(/\$\?/g, () => `$${++k}`) };
}

export function kinds(s: Node): string[] {
	const out = new Set<string>();
	const walk = (x: Node): void => {
		out.add(x.k);
		x.c.forEach(walk);
	};
	walk(s);
	return [...out].sort();
}
