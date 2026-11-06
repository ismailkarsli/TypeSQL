import type {
	Col,
	ColDesc,
	Namespace,
	Table,
	Typed,
	TypeRegistry,
	View,
} from "../../schema.js";
import type { FunctionRegistry } from "./functions.js";

export type Json<
	T,
	Flags extends Partial<ColDesc> = {},
	Base extends "json" | "jsonb" = "jsonb",
> = Col<Typed<Base, T>, Flags>;

export type Schema = {
	readonly [key: string]:
		| Table
		| View<Table>
		| Namespace
		| TypeRegistry
		| FunctionRegistry;
};
