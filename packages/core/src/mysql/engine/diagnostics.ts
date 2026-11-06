import type { Located } from "../../engine/family/diagnostics.js";
import type { Toks } from "../../engine/tokens.js";
import type { SyntaxWords } from "./parser/util.js";
import type { FunctionCatalog, Functions } from "./typer/functions.js";

/** The error with its position in the statement `T`, and a hint for unknown names. */
export type Reposition<E, T extends Toks, DB = never> = Located<
	E,
	T,
	DB,
	Builtins,
	SyntaxWords
>;

type Builtins = keyof Functions | keyof FunctionCatalog;
