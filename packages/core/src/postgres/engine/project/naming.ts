import type { Ctx } from "../../../engine/types.js";
import type { Expr, SelectStmt, Tag } from "../ast.js";
import type { ProjectSelect } from "./select.js";

export type ColumnName<
	E extends Expr,
	Alias extends string | null,
	C extends Ctx,
> = Alias extends string
	? Alias
	: Fig<E, C> extends string
		? Fig<E, C>
		: Fig<E, C> extends { readonly weak: infer W }
			? W
			: "?column?";

type Weak<N extends string> = { readonly weak: N };

type Fig<E extends Expr, C extends Ctx> =
	E extends Tag<"col">
		? E["name"]
		: E["t"] extends keyof FixedName
			? FixedName[E["t"]]
			: E extends Tag<"call">
				? E["name"]
				: E extends Tag<"cast">
					? Fig<E["e"], C> extends string
						? Fig<E["e"], C>
						: Weak<StripArray<E["to"]>>
					: E extends Tag<"typed">
						? E extends { readonly bits: true }
							? null
							: Weak<E["type"]>
						: E extends Tag<"case">
							? E["else"] extends Expr
								? Fig<E["else"], C> extends string
									? Fig<E["else"], C>
									: Weak<"case">
								: Weak<"case">
							: E extends Tag<"sub">
								? SubName<E["q"], C>
								: E extends Tag<"trim">
									? E["side"] extends "leading"
										? "ltrim"
										: E["side"] extends "trailing"
											? "rtrim"
											: "btrim"
									: E extends Tag<"idx" | "slice" | "collate">
										? Fig<E["e"], C>
										: E extends Tag<"field">
											? E["name"]
											: E extends Tag<"xml">
												? E["op"] extends "document"
													? null
													: `xml${E["op"]}`
												: E extends Tag<"jsonfn" | "jsonagg">
													? E["fn"]
													: null;

type StripArray<T extends string> = T extends `${infer B}[]` ? B : T;

type SubName<Q extends SelectStmt, C extends Ctx> =
	ProjectSelect<Q, C> extends readonly [{ readonly n: infer N }, ...unknown[]]
		? N
		: "?column?";

type FixedName = {
	bin: null;
	param: null;
	num: null;
	str: null;
	bool: null;
	null: null;
	is: null;
	quant: null;
	exists: "exists";
	array: "array";
	arraysub: "array";
	row: "row";
	extract: "extract";
	position: "position";
	substring: "substring";
	overlay: "overlay";
	attz: "timezone";
};
