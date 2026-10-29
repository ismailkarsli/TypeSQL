export { main } from "./cli.js";
export { type GenerateOptions, generateSource } from "./emit.js";
export {
	type IntrospectedColumn,
	type IntrospectedDatabase,
	type IntrospectedRelation,
	type IntrospectOptions,
	introspect,
	normalizeType,
	type RelationKind,
} from "./introspect.js";
