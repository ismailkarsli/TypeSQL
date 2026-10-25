/** What the VS Code extension bundles: completions through an API session, and the LSP glue around them. */
export type {
	CompletionItem,
	Completions,
} from "./complete/index.js";
export { mayBeInSqlLiteral } from "./literal.js";
export { merge } from "./merge.js";
export {
	type Connector,
	type Position,
	Session,
	type TypeScriptModules,
	typescriptModules,
} from "./session.js";
