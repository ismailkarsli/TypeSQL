import type {
	ConditionalTypeNode,
	Identifier,
	InferTypeNode,
	InterfaceDeclaration,
	LiteralTypeNode,
	Node,
	ParenthesizedTypeNode,
	SourceFile,
	SyntaxKind as SyntaxKindEnum,
	TupleTypeNode,
	TypeAliasDeclaration,
	TypeNode,
	UnionTypeNode,
} from "typescript/ast";

export interface Range {
	start: number;
	end: number;
}

// an edit of `text.slice(start, end)` to `text`; its anchors are the source the mutant is about
export interface SiteMutant {
	mutator: string;
	start: number;
	end: number;
	text: string;
	original: string;
	anchors: Range[];
	scope: string;
	description: string;
}

// a property's name: computed ones have no `text`
type Named = Node & { readonly name?: { readonly text?: string } };

export const MUTATORS = [
	"cond-swap",
	"cond-true",
	"cond-false",
	"never-true",
	"never-false",
	"bool-flip",
	"union-drop",
	"tuple-swap",
	"sibling-swap",
	"infer-bare",
];

/** `// type-mutate: table – <reason>` on the lines before a declaration: none of it is mutated. */
const TABLE_MARKER = /\/\/\s*type-mutate:\s*table\s*(?:–|—|\s-+)\s*\S/;

export function findMutants(
	sf: SourceFile,
	SyntaxKind: typeof SyntaxKindEnum,
): SiteMutant[] {
	const K = SyntaxKind;
	const text = sf.text;
	const out: SiteMutant[] = [];
	const seen = new Set<string>();
	let scope = "-";
	const src = (n: Node) => text.slice(n.getStart(), n.end);
	const range = (n: Node): Range => ({ start: n.getStart(), end: n.end });
	const add = (
		mutator: string,
		start: number,
		end: number,
		replacement: string,
		anchors: Range[],
		description: string,
	) => {
		const original = text.slice(start, end);
		if (original === replacement) return;
		const key = `${start}:${end}:${replacement}`;
		if (seen.has(key)) return;
		seen.add(key);
		out.push({
			mutator,
			start,
			end,
			text: replacement,
			original,
			anchors,
			scope,
			description,
		});
	};

	const children = (n: Node) => {
		const cs: Node[] = [];
		n.forEachChild((c) => void cs.push(c));
		return cs;
	};
	const isNever = (n: Node) => n.kind === K.NeverKeyword;
	const literalKind = (n: Node) =>
		n.kind === K.LiteralType ? (n as LiteralTypeNode).literal.kind : undefined;

	// `infer` names declared in `n`, not inside a nested conditional's own branches
	const inferNames = (n: Node) => {
		const names = new Set<string>();
		const walk = (x: Node): void => {
			if (x.kind === K.InferType)
				names.add((x as InferTypeNode).typeParameter.name.text);
			if (x.kind === K.ConditionalType) {
				walk((x as ConditionalTypeNode).checkType);
				walk((x as ConditionalTypeNode).extendsType);
				return;
			}
			x.forEachChild(walk);
		};
		walk(n);
		return names;
	};
	const uses = (n: Node, names: Set<string>) => {
		if (!names.size) return false;
		let hit = false;
		const walk = (x: Node): void => {
			if (hit) return;
			if (x.kind === K.Identifier && names.has((x as Identifier).text))
				hit = true;
			else x.forEachChild(walk);
		};
		walk(n);
		return hit;
	};
	const testRange = (c: ConditionalTypeNode): Range => ({
		start: c.checkType.getStart(),
		end: c.extendsType.end,
	});
	const leaf = (n: TypeNode) => {
		let x = n;
		while (x.kind === K.ParenthesizedType)
			x = (x as ParenthesizedTypeNode).type;
		return x.kind !== K.ConditionalType;
	};
	// `-1` is a PrefixUnaryExpression literal
	const numbers = (n: Node) => {
		const out: LiteralTypeNode[] = [];
		const walk = (x: Node): void => {
			if (
				x.kind === K.LiteralType &&
				((x as LiteralTypeNode).literal.kind === K.NumericLiteral ||
					(x as LiteralTypeNode).literal.kind === K.PrefixUnaryExpression)
			)
				out.push(x as LiteralTypeNode);
			else x.forEachChild(walk);
		};
		walk(n);
		return out;
	};

	const conditional = (c: ConditionalTypeNode) => {
		const t = c.trueType;
		const f = c.falseType;
		const at = testRange(c);
		const where = `\`${oneLine(src(c.checkType))} extends ${oneLine(src(c.extendsType))}\``;
		const span = { start: t.getStart(), end: f.end };
		const between = text.slice(t.end, f.getStart());
		const inferred = inferNames(c.extendsType);
		// cond-swap and cond-true would move a true branch that uses an `infer` name out of its scope
		const trueUsesInfer = uses(t, inferred);
		// `X extends infer S` (no constraint), `X extends unknown` and `X extends any` always match:
		// the false branch cannot be reached, so mutants that only change it are equivalent
		const alwaysMatches =
			(c.extendsType.kind === K.InferType &&
				!(c.extendsType as InferTypeNode).typeParameter.constraint) ||
			c.extendsType.kind === K.UnknownKeyword ||
			c.extendsType.kind === K.AnyKeyword;
		if (src(t) !== src(f)) {
			if (!trueUsesInfer)
				add(
					"cond-swap",
					span.start,
					span.end,
					src(f) + between + src(t),
					[at],
					`swap the branches of ${where}`,
				);
			if (!trueUsesInfer && !alwaysMatches)
				add(
					"cond-true",
					f.getStart(),
					f.end,
					src(t),
					[at],
					`${where} always takes its true branch`,
				);
			add(
				"cond-false",
				t.getStart(),
				t.end,
				src(f),
				[at],
				`${where} never takes its true branch`,
			);
		}
		if (!isNever(t))
			add(
				"never-true",
				t.getStart(),
				t.end,
				"never",
				leaf(t) ? [at, range(t)] : [at],
				`the true branch of ${where} is \`never\``,
			);
		if (!isNever(f) && !alwaysMatches)
			add(
				"never-false",
				f.getStart(),
				f.end,
				"never",
				leaf(f) ? [range(f)] : [at],
				`the false branch of ${where} is \`never\``,
			);
		let next = f;
		while (next.kind === K.ParenthesizedType)
			next = (next as ParenthesizedTypeNode).type;
		if (next.kind === K.ConditionalType) {
			const sibling = next as ConditionalTypeNode;
			const a = numbers(t);
			const b = numbers(sibling.trueType);
			if (
				a.length &&
				a.length === b.length &&
				a.some((x, i) => src(x) !== src(b[i]!))
			) {
				const start = a[0]!.getStart();
				const end = b[b.length - 1]!.end;
				const edits = [
					...a.map((x, i): [Node, string] => [x, src(b[i]!)]),
					...b.map((x, i): [Node, string] => [x, src(a[i]!)]),
				];
				let replaced = "";
				let at2 = start;
				for (const [x, s] of edits) {
					replaced += text.slice(at2, x.getStart()) + s;
					at2 = x.end;
				}
				replaced += text.slice(at2, end);
				const other = `\`${oneLine(src(sibling.checkType))} extends ${oneLine(src(sibling.extendsType))}\``;
				add(
					"sibling-swap",
					start,
					end,
					replaced,
					[...a, ...b].map(range),
					`swap the numbers of the branches of ${where} (${a.map(src).join(", ")}) and ${other} (${b.map(src).join(", ")})`,
				);
			}
		}
	};

	const visit = (n: Node) => {
		const outer = scope;
		// a table checked elsewhere (the oracles compare it with Postgres's catalogs) is not mutated
		if (
			(n.kind === K.TypeAliasDeclaration ||
				n.kind === K.InterfaceDeclaration) &&
			TABLE_MARKER.test(text.slice(n.pos, n.getStart()))
		)
			return;
		if (
			(n.kind === K.TypeAliasDeclaration ||
				n.kind === K.InterfaceDeclaration) &&
			(n as TypeAliasDeclaration | InterfaceDeclaration).name?.text
		)
			scope = (n as TypeAliasDeclaration | InterfaceDeclaration).name.text;
		// per-property scope keeps ids stable when entries are added to a table such as pg-functions.ts
		else if (
			n.kind === K.PropertySignature &&
			(n as Named).name?.text !== undefined
		)
			scope = `${scope}.${(n as Named).name!.text}`;
		switch (n.kind) {
			case K.ConditionalType:
				conditional(n as ConditionalTypeNode);
				break;
			case K.LiteralType:
				if ((n as LiteralTypeNode).literal.kind === K.TrueKeyword)
					add(
						"bool-flip",
						n.getStart(),
						n.end,
						"false",
						[range(n)],
						"`true` → `false`",
					);
				else if ((n as LiteralTypeNode).literal.kind === K.FalseKeyword)
					add(
						"bool-flip",
						n.getStart(),
						n.end,
						"true",
						[range(n)],
						"`false` → `true`",
					);
				break;
			case K.UnionType: {
				const types = [...(n as UnionTypeNode).types];
				if (
					types.length >= 2 &&
					types.every((m) => literalKind(m) === K.StringLiteral)
				) {
					types.forEach((m, i) => {
						const start = i === 0 ? n.getStart() : types[i - 1]!.end;
						const end = i === 0 ? types[1]!.getStart() : m.end;
						add(
							"union-drop",
							start,
							end,
							"",
							[range(m)],
							`drop ${src(m)} from the union`,
						);
					});
				}
				break;
			}
			case K.TupleType: {
				const els = [...(n as TupleTypeNode).elements];
				for (let i = 0; i + 1 < els.length; i++) {
					const a = els[i]!;
					const b = els[i + 1]!;
					if (
						a.kind !== b.kind ||
						a.kind === K.NamedTupleMember ||
						src(a) === src(b)
					)
						continue;
					add(
						"tuple-swap",
						a.getStart(),
						b.end,
						src(b) + text.slice(a.end, b.getStart()) + src(a),
						[range(a), range(b)],
						`swap the tuple members ${oneLine(src(a))} and ${oneLine(src(b))}`,
					);
				}
				break;
			}
			case K.InferType: {
				const p = (n as InferTypeNode).typeParameter;
				if (p.constraint)
					add(
						"infer-bare",
						p.name.end,
						p.constraint.end,
						"",
						[range(p.constraint)],
						`drop the constraint of \`infer ${p.name.text} extends ${oneLine(src(p.constraint))}\``,
					);
				break;
			}
		}
		for (const c of children(n)) visit(c);
		scope = outer;
	};
	visit(sf);
	return out.sort(
		(a, b) =>
			a.anchors[0]!.start - b.anchors[0]!.start ||
			MUTATORS.indexOf(a.mutator) - MUTATORS.indexOf(b.mutator) ||
			a.start - b.start,
	);
}

export function oneLine(s: string, max = 60): string {
	const t = s.replace(/\s+/g, " ").trim();
	return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}
