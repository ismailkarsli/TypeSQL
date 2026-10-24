/**
 * `@typesql/core/engine`: every type of the engine, under names that printed types can refer
 * to. The type cache imports it as `__T` and writes its entries with these names, and a
 * declaration file that has to spell out an unresolved engine type imports it from here. Not a
 * stable API: these types change with the engine.
 */

export type {
	CallTypes,
	ListRep,
	SlotMap,
	SlotsFor,
	Slottable,
	SplicedText,
} from "../create-sql.js";
export type * from "../index.js";
export type { ValidateDdl } from "../migrations.js";
export type { CARRIED, PARAMS, ROW, TEXT } from "../query.js";
export type { CamelCase, CamelCaseKeys, KeyedRow } from "../row-keys.js";
export type {
	ColDesc,
	FunctionRegistry,
	InformationSchemaNamespace,
	Namespace,
	NormalizeTypeName,
	PgCatalogNamespace,
	PgScalarName,
	PgTypeName,
	Schema,
	Table,
	TypeRegistry,
} from "../schema/index.js";
export type { SqlDriver } from "../transaction.js";
export type { EnumsOf, TsOf, TsTypeOf } from "../type-map/index.js";
export type * as Ast from "./ast.js";
export type {
	Builtin,
	CacheAnalysis,
	CacheEntry,
	CacheSnapshots,
	CacheVersion,
	CallEntry,
	DbSnapshot,
	DdlCache,
	DdlCacheKeys,
	DdlEffect,
	HintIndex,
	Missing,
	QueryCache,
	QueryCacheKeys,
} from "./cache.js";
export type { AnyErr, ErrAt, ErrMsg, IsErr } from "./errors.js";
export type {
	Analysis,
	Analyze,
	ArgsOf,
	BuildRow,
	KindOf,
	NamesOf,
	NonArrayOrSqlJson,
	ParamsArgs,
} from "./infer.js";
export type {
	CheckEnc,
	DefaultMarker,
	DescribeEnc,
	Enc,
	InlineMarker,
	JsonMarker,
	JsonValue,
	RewriteInlineStr,
	ValueEnc,
} from "./inline.js";
export type { Lex } from "./lexer/lex.js";
export type {
	IdTok,
	NumTok,
	OpTok,
	ParamTok,
	StrTok,
	Tok,
	Toks,
	WordTok,
} from "./lexer/tokens.js";
export type { NamedParams, RewriteNamed } from "./named.js";
export type { ParseProgram, ParseStatement } from "./parser/stmt.js";
export type {
	HasSlots,
	JoinedText,
	MaxParamStr,
	QuotedIdent,
	SlotNames,
	Splice,
	Take,
	UnknownTuple,
} from "./splice.js";
export type { SigFlags } from "./typer/catalog.js";
export type {
	ColInfo,
	ColMap,
	Cols,
	CteMap,
	Ctx,
	Scope,
	ScopeItem,
	ScopeLevel,
} from "./types.js";
export type { SetRep, ValuesRep } from "./write.js";
