/**
 * Finds the statements of a program: `sql(…)` calls (the callee is core's `Sql` or
 * `TransactionalSql`, whatever it is named locally) and `migrations().add(…)` steps. Only the
 * callee, the receiver and the first arguments are typed, not the call: discovering 500
 * queries takes milliseconds and analyses none of them.
 */

import type {
	CallExpression,
	LiteralTypeNode,
	Node,
	PropertyAccessExpression,
	SourceFile,
	StringLiteral,
	TypeAliasDeclaration,
	TypeNode,
	TypeReferenceNode,
} from "typescript/ast";
import type {
	Checker,
	Program,
	Symbol as TsSymbol,
	Type,
} from "typescript/async";

/** SyntaxKind values (typescript/ast), passed in so this module loads nothing at runtime. */
export interface Kinds {
	readonly CallExpression: number;
	readonly PropertyAccessExpression: number;
	readonly TypeReference: number;
	readonly LiteralType: number;
	readonly StringLiteral: number;
	readonly TypeAliasDeclaration: number;
}

export interface SqlSite {
	/** The query literal (with `:name` and `${sql.param()}` markers as written). */
	readonly key: string;
	readonly file: string;
	readonly db: Type;
	readonly tm: Type;
	readonly keys: Type;
	/** The slot object's type for `sql("… {slot} …", { slot })`, else null. */
	readonly slots: Type | null;
}

/** A statement written as a type: `RowOf<DB, TM, "SELECT …">`, or a literal argument of the project's own alias. */
export interface TypeSite {
	readonly key: string;
	readonly file: string;
	readonly db: Type;
}

export interface DdlSite {
	readonly key: string;
	readonly file: string;
	/** The schema before the step (`Migrations<DB>`'s `DB`). */
	readonly db: Type;
}

const SLOT = /\{[A-Za-z_][A-Za-z0-9_]*\}/;
/** Core aliases taking `(DB, …, Q)`: the index of `Q`. */
const QUERY_ALIASES: { readonly [name: string]: number } = {
	RowOf: 2,
	ParamsOf: 2,
	ArgsOf: 2,
	ParamsArgs: 2,
	Validate: 1,
	KindOf: 1,
	NamesOf: 1,
	Analysis: 1,
};
const DDL_ALIASES: { readonly [name: string]: number } = {
	ApplyDdl: 1,
	ValidateDdl: 1,
};
const LOOKS_LIKE_QUERY =
	/^\s*(\(\s*)*(select|with|insert|update|delete|values|table)\b/i;
const LOOKS_LIKE_DDL = /^\s*(create|alter|drop|comment)\b/i;

export async function discover(
	program: Program,
	checker: Checker,
	kinds: Kinds,
	isCorePath: (path: string) => boolean,
	include: (fileName: string) => boolean,
): Promise<{ sql: SqlSite[]; types: TypeSite[]; ddl: DdlSite[] }> {
	const sql: SqlSite[] = [];
	const types: TypeSite[] = [];
	const ddl: DdlSite[] = [];
	const aliasMemo = new Map<number, Promise<Wrapped | null>>();
	for (const fileName of await program.getSourceFileNames()) {
		if (!include(fileName)) continue;
		const sf = await program.getSourceFile(fileName);
		if (!sf) continue;
		const { calls, refs } = nodesIn(sf, kinds);
		if (!calls.length && !refs.length) continue;
		/** `DB` types this file uses, for literals passed to the project's own aliases. */
		const fileDbs = new Map<number, Type>();
		const loose: string[] = [];

		// statements written as types
		const syms = refs.length
			? await checker.getSymbolAtLocation(refs.map((r) => r.typeName))
			: [];
		await Promise.all(
			refs.map(async (r, i) => {
				let sym = syms[i];
				if (sym && sym.flags & 2097152 /* SymbolFlags.Alias */)
					sym = await checker.getAliasedSymbol(sym);
				const args = r.typeArguments ?? [];
				const isCore =
					!!sym && sym.declarations.some((d) => isCorePath(d.path));
				const qAt = isCore
					? (QUERY_ALIASES[sym!.name] ?? DDL_ALIASES[sym!.name])
					: undefined;
				if (qAt !== undefined && args[0] && args[qAt]) {
					const db = await checker.getTypeFromTypeNode(args[0]);
					fileDbs.set(db.id, db);
					const key = literalOf(args[qAt]!, kinds);
					if (key === null) return;
					(sym!.name in DDL_ALIASES ? ddl : types).push({
						key,
						db,
						file: fileName,
					});
					return;
				}
				// the project's own alias of a core one: `type Row<Q extends string> = RowOf<DB, TM, Q>`
				const wrapped =
					sym && !isCore
						? await wrappedCoreAlias(
								sym,
								program,
								checker,
								kinds,
								isCorePath,
								aliasMemo,
							)
						: null;
				if (wrapped) {
					const key = args[wrapped.param]
						? literalOf(args[wrapped.param]!, kinds)
						: null;
					if (key !== null)
						(wrapped.ddl ? ddl : types).push({
							key,
							db: wrapped.db,
							file: fileName,
						});
				} else if (!isCore) {
					for (const a of args) {
						const key = literalOf(a, kinds);
						if (
							key !== null &&
							(LOOKS_LIKE_QUERY.test(key) || LOOKS_LIKE_DDL.test(key))
						)
							loose.push(key);
					}
				}
			}),
		);

		// migration steps: the receiver is core's Migrations<DB>
		const adds = calls.filter(
			(c) =>
				c.expression.kind === kinds.PropertyAccessExpression &&
				(c.expression as PropertyAccessExpression).name.text === "add",
		);
		if (adds.length) {
			const receivers = await checker.getTypeAtLocation(
				adds.map((c) => (c.expression as PropertyAccessExpression).expression),
			);
			const args = await checker.getTypeAtLocation(
				adds.map((c) => c.arguments[0]!),
			);
			await Promise.all(
				adds.map(async (_, i) => {
					const r = receivers[i]!;
					const a = args[i]!;
					if (
						!a.isStringLiteralType() ||
						!(await isCoreRef(r, ["Migrations"], isCorePath))
					)
						return;
					const [db] = await checker.getTypeArguments(r as never);
					if (db) ddl.push({ key: a.value, db, file: fileName });
				}),
			);
		}

		// sql(…) calls: the callee is core's Sql or TransactionalSql
		const others = calls.filter((c) => !adds.includes(c));
		const callees = others.length
			? await checker.getTypeAtLocation(others.map((c) => c.expression))
			: [];
		const hits = (
			await Promise.all(
				others.map((_, i) =>
					isCoreRef(callees[i]!, ["Sql", "TransactionalSql"], isCorePath).then(
						(ok) => (ok ? i : -1),
					),
				),
			)
		).filter((i) => i >= 0);
		const firstArgs = hits.length
			? await checker.getTypeAtLocation(
					hits.map((i) => others[i]!.arguments[0]!),
				)
			: [];
		await Promise.all(
			hits.map(async (i, k) => {
				const [db, tm, keys] = await checker.getTypeArguments(
					callees[i]! as never,
				);
				if (!db || !tm || !keys) return;
				fileDbs.set(db.id, db);
				const a = firstArgs[k]!;
				if (!a.isStringLiteralType()) return;
				const call = others[i]!;
				const slots =
					SLOT.test(a.value) && call.arguments.length > 1
						? await checker.getTypeAtLocation(call.arguments[1]!)
						: null;
				sql.push({ key: a.value, db, tm, keys, slots, file: fileName });
			}),
		);

		for (const key of loose)
			for (const db of fileDbs.values())
				(LOOKS_LIKE_DDL.test(key) ? ddl : types).push({
					key,
					db,
					file: fileName,
				});
	}
	return { sql, types, ddl };
}

interface Wrapped {
	/** Index of the alias's type parameter that is the statement text. */
	readonly param: number;
	readonly db: Type;
	readonly ddl: boolean;
}

/** For `type R<Q> = RowOf<DB, TM, Q>` (or `ApplyDdl<DB, Q>`, …): which parameter is the text, and the `DB`. */
function wrappedCoreAlias(
	sym: TsSymbol,
	program: Program,
	checker: Checker,
	kinds: Kinds,
	isCorePath: (path: string) => boolean,
	memo: Map<number, Promise<Wrapped | null>>,
): Promise<Wrapped | null> {
	let found = memo.get(sym.id);
	if (!found) {
		found = (async () => {
			const handle = sym.declarations[0];
			if (!handle || handle.kind !== kinds.TypeAliasDeclaration) return null;
			const decl = (await handle.resolve(program.getProject())) as
				| TypeAliasDeclaration
				| undefined;
			const body = decl?.type;
			if (!decl || !body || body.kind !== kinds.TypeReference) return null;
			const ref = body as TypeReferenceNode;
			let target = await checker.getSymbolAtLocation(ref.typeName);
			if (target && target.flags & 2097152)
				target = await checker.getAliasedSymbol(target);
			if (!target || !target.declarations.some((d) => isCorePath(d.path)))
				return null;
			const qAt = QUERY_ALIASES[target.name] ?? DDL_ALIASES[target.name];
			const qArg = qAt === undefined ? undefined : ref.typeArguments?.[qAt];
			const dbArg = ref.typeArguments?.[0];
			if (!qArg || !dbArg || qArg.kind !== kinds.TypeReference) return null;
			const qName = ((qArg as TypeReferenceNode).typeName as { text?: string })
				.text;
			const param =
				decl.typeParameters?.findIndex((tp) => tp.name.text === qName) ?? -1;
			if (param < 0) return null;
			return {
				param,
				db: await checker.getTypeFromTypeNode(dbArg),
				ddl: target.name in DDL_ALIASES,
			};
		})();
		memo.set(sym.id, found);
	}
	return found;
}

function literalOf(node: TypeNode, kinds: Kinds): string | null {
	if (node.kind !== kinds.LiteralType) return null;
	const lit = (node as LiteralTypeNode).literal;
	return lit.kind === kinds.StringLiteral ? (lit as StringLiteral).text : null;
}

function nodesIn(
	sf: SourceFile,
	kinds: Kinds,
): { calls: CallExpression[]; refs: TypeReferenceNode[] } {
	const calls: CallExpression[] = [];
	const refs: TypeReferenceNode[] = [];
	const walk = (n: Node): void => {
		if (
			n.kind === kinds.CallExpression &&
			(n as CallExpression).arguments.length > 0
		)
			calls.push(n as CallExpression);
		else if (
			n.kind === kinds.TypeReference &&
			(n as TypeReferenceNode).typeArguments?.some(
				(a) => literalOf(a, kinds) !== null,
			)
		)
			refs.push(n as TypeReferenceNode);
		n.forEachChild(walk);
	};
	walk(sf);
	return { calls, refs };
}

/** Whether `type` is a reference to one of core's `names` (`Sql`, `Migrations`, …). */
export async function isCoreRef(
	type: Type,
	names: readonly string[],
	isCorePath: (path: string) => boolean,
): Promise<boolean> {
	if (!type.isTypeReference()) return false;
	const sym = await type.getSymbol();
	return (
		!!sym &&
		names.includes(sym.name) &&
		sym.declarations.some((d) => isCorePath(d.path))
	);
}
