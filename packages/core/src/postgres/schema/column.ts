import type {
	Col,
	ColDesc,
	Namespace,
	Shaped,
	Table,
	TsShape,
	TypeRegistry,
	View,
} from "../../schema.js";
import type { Overloads } from "../engine/typer/catalog.js";

export type Json<
	T,
	Flags extends Partial<ColDesc> = {},
	Base extends "json" | "jsonb" = "jsonb",
> = Col<Shaped<Base, TsShape<T>>, Flags>;

export type FunctionRegistry = { readonly [name: string]: Overloads };

export type Schema = {
	readonly [key: string]:
		| Table
		| View<Table>
		| Namespace
		| TypeRegistry
		| FunctionRegistry;
};
