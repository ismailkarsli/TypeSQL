import type { Node } from "typescript/ast";
import type { Checker, Symbol as TsSymbol, Type } from "typescript/async";

const FLAGS = 1;
const TYPE_MEANING = 788968;
const OPTIONAL = 16777216;

const KEYWORDS = new Set([
	"string",
	"number",
	"boolean",
	"bigint",
	"symbol",
	"null",
	"undefined",
	"unknown",
	"any",
	"never",
	"void",
	"object",
	"true",
	"false",
	"readonly",
	"keyof",
	"typeof",
	"unique",
	"infer",
	"extends",
	"is",
	"asserts",
	"this",
	"new",
	"in",
	"out",
]);

export class Printer {
	private readonly globals = new Map<string, Promise<boolean>>();
	private readonly checker: Checker;
	private readonly at: Node;
	private readonly isCorePath: (path: string) => boolean;

	constructor(
		checker: Checker,
		at: Node,
		isCorePath: (path: string) => boolean,
	) {
		this.checker = checker;
		this.at = at;
		this.isCorePath = isCorePath;
	}

	print(type: Type): Promise<string> {
		return this.checker.typeToString(type, this.at, FLAGS);
	}

	async foreign(text: string): Promise<string | null> {
		for (const name of names(text)) {
			if (name.startsWith("import:")) return name;
			if (!(await this.isGlobal(name))) return name;
		}
		return null;
	}

	private isGlobal(name: string): Promise<boolean> {
		let known = this.globals.get(name);
		if (!known) {
			known = this.checker
				.resolveName(name, TYPE_MEANING, this.at, false)
				.then((sym) => {
					const path = sym?.declarations?.[0]?.path ?? "";
					return (
						/\/lib\.[\w.]+\.d\.ts$/.test(path) ||
						/\/node_modules\/@types\//.test(path)
					);
				});
			this.globals.set(name, known);
		}
		return known;
	}

	async snapshot(type: Type, depth = 8): Promise<string | null> {
		const text = await this.print(type);
		if ((await this.foreign(text)) === null) return text;
		if (depth === 0) return null;
		const c = this.checker;
		if (type.isUnionType() || type.isIntersectionType()) {
			const parts = await Promise.all(
				((await type.getTypes()) ?? []).map((t) => this.snapshot(t, depth - 1)),
			);
			if (parts.some((p) => p === null)) return null;
			return parts
				.map((p) => `(${p})`)
				.join(type.isUnionType() ? " | " : " & ");
		}
		const alias = await type.getAliasSymbol();
		if (alias && alias.declarations.some((d) => this.isCorePath(d.path))) {
			const args = await Promise.all(
				(await type.getAliasTypeArguments()).map((t) =>
					this.snapshot(t, depth - 1),
				),
			);
			if (args.some((a) => a === null)) return null;
			return `__T.${alias.name}${args.length ? `<${args.join(", ")}>` : ""}`;
		}
		if (await c.isTupleType(type)) return null;
		if (await c.isArrayType(type)) {
			const [elem] = await c.getTypeArguments(type as never);
			const e = elem && (await this.snapshot(elem, depth - 1));
			return e === null || e === undefined ? null : `readonly (${e})[]`;
		}
		if (!type.isObjectType()) return null;
		if (
			(await c.getSignaturesOfType(type, 0)).length ||
			(await c.getSignaturesOfType(type, 1)).length
		)
			return null;
		const members: string[] = [];
		for (const info of await c.getIndexInfosOfType(type)) {
			const k = await this.snapshot(info.keyType, depth - 1);
			const v = await this.snapshot(info.valueType, depth - 1);
			if (k === null || v === null) return null;
			members.push(`${info.isReadonly ? "readonly " : ""}[key: ${k}]: ${v}`);
		}
		for (const prop of await c.getPropertiesOfType(type)) {
			const member = await this.member(prop, depth);
			if (member === null) return null;
			members.push(member);
		}
		return `{ ${members.join("; ")} }`;
	}

	private async member(prop: TsSymbol, depth: number): Promise<string | null> {
		const c = this.checker;
		const optional = (prop.flags & OPTIONAL) !== 0;
		const t = optional
			? await c.getNonMissingTypeOfSymbol(prop)
			: await c.getTypeOfSymbol(prop);
		const v = await this.snapshot(t, depth - 1);
		if (v === null) return null;
		return `${(await c.isReadonlySymbol(prop)) ? "readonly " : ""}${JSON.stringify(prop.name)}${optional ? "?" : ""}: ${v}`;
	}
}

export function names(text: string): string[] {
	const out: string[] = [];
	let i = 0;
	while (i < text.length) {
		const ch = text[i]!;
		if (ch === '"' || ch === "'" || ch === "`") {
			i++;
			while (i < text.length && text[i] !== ch) i += text[i] === "\\" ? 2 : 1;
			i++;
			continue;
		}
		if (text.startsWith("import(", i)) {
			const m = /^import\("([^"]*)"\)/.exec(text.slice(i));
			out.push(`import:${m?.[1] ?? "?"}`);
			i += m ? m[0].length : 7;
			continue;
		}
		if (/[A-Za-z_$]/.test(ch)) {
			let j = i + 1;
			while (j < text.length && /[\w$]/.test(text[j]!)) j++;
			const id = text.slice(i, j);
			let k = j;
			while (text[k] === " ") k++;
			const isProperty =
				text[k] === ":" ||
				(text[k] === "?" && text[k + 1] === ":") ||
				text[i - 1] === ".";
			if (!isProperty && !KEYWORDS.has(id) && id !== "__T") out.push(id);
			i = j;
			continue;
		}
		i++;
	}
	return out;
}

export const coreNames = (
	text: string,
	specifiers: readonly string[],
): string =>
	specifiers.reduce(
		(t, spec) => t.replaceAll(`import(${JSON.stringify(spec)}).`, "__T."),
		text,
	);
