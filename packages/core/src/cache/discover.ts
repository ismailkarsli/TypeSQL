import { sep } from "node:path";
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
import type { CacheDialect } from "./dialect.js";

export interface Kinds {
	readonly CallExpression: number;
	readonly PropertyAccessExpression: number;
	readonly TypeReference: number;
	readonly LiteralType: number;
	readonly StringLiteral: number;
	readonly TypeAliasDeclaration: number;
}

export interface SqlSite {
	readonly key: string;
	readonly file: string;
	readonly db: Type;
	readonly tm: Type;
	readonly keys: Type;
	readonly slots: Type | null;
}

export interface TypeSite {
	readonly key: string;
	readonly file: string;
	readonly db: Type;
}

export interface DdlSite {
	readonly key: string;
	readonly file: string;
	readonly db: Type;
}

const SLOT = /\{[A-Za-z_][A-Za-z0-9_]*\}/;
export async function discover(
	program: Program,
	checker: Checker,
	kinds: Kinds,
	isCorePath: (path: string) => boolean,
	include: (fileName: string) => boolean,
	dialect: CacheDialect,
): Promise<{ sql: SqlSite[]; types: TypeSite[]; ddl: DdlSite[] }> {
	const { queryAliases, ddlAliases, looksLikeQuery, looksLikeDdl } = dialect;
	const isDialectPath = (path: string): boolean => {
		if (!isCorePath(path)) return false;
		const root = Math.max(
			path.lastIndexOf(`${sep}dist${sep}`),
			path.lastIndexOf(`${sep}src${sep}`),
		);
		return path
			.slice(path.indexOf(sep, root + 1) + 1)
			.startsWith(`${dialect.dir}${sep}`);
	};
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
		const fileDbs = new Map<number, Type>();
		const loose: string[] = [];

		const syms = refs.length
			? await checker.getSymbolAtLocation(refs.map((r) => r.typeName))
			: [];
		await Promise.all(
			refs.map(async (r, i) => {
				let sym = syms[i];
				if (sym && sym.flags & 2097152)
					sym = await checker.getAliasedSymbol(sym);
				const args = r.typeArguments ?? [];
				const isCore =
					!!sym && sym.declarations.some((d) => isCorePath(d.path));
				const isOurs =
					!!sym && sym.declarations.some((d) => isDialectPath(d.path));
				if (isCore && !isOurs) return;
				const qAt = isOurs
					? (queryAliases[sym!.name] ?? ddlAliases[sym!.name])
					: undefined;
				if (qAt !== undefined && args[0] && args[qAt]) {
					const db = await checker.getTypeFromTypeNode(args[0]);
					fileDbs.set(db.id, db);
					const key = literalOf(args[qAt]!, kinds);
					if (key === null) return;
					(sym!.name in ddlAliases ? ddl : types).push({
						key,
						db,
						file: fileName,
					});
					return;
				}
				const wrapped =
					sym && !isCore
						? await wrappedCoreAlias(
								sym,
								program,
								checker,
								kinds,
								isCorePath,
								aliasMemo,
								dialect,
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
							(looksLikeQuery.test(key) || looksLikeDdl.test(key))
						)
							loose.push(key);
					}
				}
			}),
		);

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
					const [types, db] = await checker.getTypeArguments(r as never);
					if ((await types?.getSymbol())?.name !== dialect.typesName) return;
					if (db) ddl.push({ key: a.value, db, file: fileName });
				}),
			);
		}

		const others = calls.filter((c) => !adds.includes(c));
		const callees = others.length
			? await checker.getTypeAtLocation(others.map((c) => c.expression))
			: [];
		const hits = (
			await Promise.all(
				others.map((_, i) =>
					isCoreRef(callees[i]!, dialect.sqlTypes, isDialectPath).then((ok) =>
						ok ? i : -1,
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
				(looksLikeDdl.test(key) ? ddl : types).push({
					key,
					db,
					file: fileName,
				});
	}
	return { sql, types, ddl };
}

interface Wrapped {
	readonly param: number;
	readonly db: Type;
	readonly ddl: boolean;
}

function wrappedCoreAlias(
	sym: TsSymbol,
	program: Program,
	checker: Checker,
	kinds: Kinds,
	isCorePath: (path: string) => boolean,
	memo: Map<number, Promise<Wrapped | null>>,
	{ queryAliases, ddlAliases }: CacheDialect,
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
			const qAt = queryAliases[target.name] ?? ddlAliases[target.name];
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
				ddl: target.name in ddlAliases,
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
