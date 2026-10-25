/**
 * `sqlCallAt` on source files parsed by TypeScript 7, with a fake checker: which literal the
 * cursor is in, its text and range, and which callees are core's `Sql` / `TransactionalSql`.
 */
import { SyntaxKind } from "typescript/ast";
import { API, type Checker, type Program, type Type } from "typescript/async";
import { afterAll, beforeAll, expect, test } from "vitest";
import {
	completionsAt,
	editorKinds,
	sqlCallAt,
} from "../../src/complete/index.js";

const kinds = editorKinds(SyntaxKind as unknown as Record<string, number>);
let api: API;
beforeAll(() => {
	api = new API({ cwd: import.meta.dirname });
});
afterAll(async () => {
	await api?.close();
});

const CORE = "/app/node_modules/@typesql/core/dist/index.d.ts";
const isCorePath = (path: string): boolean =>
	path.startsWith("/app/node_modules/@typesql/core/");

/** A fake checker type: a reference (or not) to `name` (or no symbol) declared in `paths`. */
const ref = (
	name: string | null,
	paths: readonly string[] = [CORE],
	reference = true,
): Type =>
	({
		isTypeReference: () => reference,
		getSymbol: async () =>
			name === null
				? undefined
				: { name, declarations: paths.map((path) => ({ path })) },
	}) as unknown as Type;

const DB = { id: 1 } as Type;
const CALLEES: Record<string, Type> = {
	sql: ref("Sql"),
	tx: ref("TransactionalSql"),
};

interface Found {
	/** The literal's range in the file. */
	readonly raw: string;
	/** `SqlCall.text`. */
	readonly text: string;
	/** The cursor's offset in `text`. */
	readonly cursor: number;
}

/** A checker that types each callee (or receiver) by its source text, and counts schema reads. */
function checker(
	text: () => string,
	callees: Record<string, Type>,
	typeArguments: readonly Type[] = [DB],
) {
	const reads = { count: 0 };
	const c = {
		getTypeAtLocation: async (n: { getStart(): number; end: number }) =>
			callees[text().slice(n.getStart(), n.end)] ?? ref("Other"),
		getTypeArguments: async () => typeArguments,
		getPropertiesOfType: async () => {
			reads.count++;
			return [];
		},
	} as unknown as Checker;
	return { checker: c, reads };
}

async function parse(marked: string) {
	const offset = marked.indexOf("|");
	const text = marked.slice(0, offset) + marked.slice(offset + 1);
	const { sourceFile } = await api.createSourceFile("/app/src/q.ts", text);
	const program = {
		getSourceFile: async () => sourceFile,
	} as unknown as Program;
	return { offset, text, program, sourceFile };
}

/** The literal at the `|` in `marked`, or null. */
async function at(
	marked: string,
	callees = CALLEES,
	typeArguments?: readonly Type[],
): Promise<Found | null> {
	const { offset, text, program } = await parse(marked);
	const c = checker(() => text, callees, typeArguments).checker;
	const call = await sqlCallAt(
		program,
		c,
		kinds,
		{ uri: "file:///app/src/q.ts" },
		offset,
		isCorePath,
	);
	if (!call) return null;
	expect(call.db).toBe(DB);
	expect(call.offset).toBe(offset);
	expect(call.text.length).toBe(call.end - call.start);
	return {
		raw: text.slice(call.start, call.end),
		text: call.text,
		cursor: call.offset - call.start,
	};
}

test("the literal of a sql call: its text and the cursor in it", async () => {
	expect(await at(`sql("SELECT * FROM |");`)).toEqual({
		raw: "SELECT * FROM ",
		text: "SELECT * FROM ",
		cursor: 14,
	});
	// right after the opening quote, right before the closing one
	expect(await at(`sql("|SELECT");`)).toMatchObject({ cursor: 0 });
	expect(await at(`sql("SELECT|");`)).toMatchObject({ cursor: 6 });
	expect(await at("sql(`SELECT * FROM |`);")).toMatchObject({
		raw: "SELECT * FROM ",
	});
	expect(await at("sql('SELECT * FROM |');")).toMatchObject({
		raw: "SELECT * FROM ",
	});
});

test("a cursor before the opening quote or after the closing one is outside", async () => {
	expect(await at(`sql(|"SELECT");`)).toBeNull();
	expect(await at(`sql( |"SELECT");`)).toBeNull();
	expect(await at(`sql("SELECT"|);`)).toBeNull();
	expect(await at(`sql("SELECT" |);`)).toBeNull();
	expect(await at(`sql("SELECT", |);`)).toBeNull();
	expect(await at(`|sql("SELECT");`)).toBeNull();
	expect(await at(`sql("SELECT");|`)).toBeNull();
});

test("an unterminated literal, still being typed, runs to the end of its line", async () => {
	expect(await at(`sql("SELECT * FROM |`)).toEqual({
		raw: "SELECT * FROM ",
		text: "SELECT * FROM ",
		cursor: 14,
	});
	expect(await at(`sql("SELECT * FROM |\nconst x = 1;`)).toMatchObject({
		raw: "SELECT * FROM ",
	});
	expect(await at(`sql("|`)).toEqual({ raw: "", text: "", cursor: 0 });
	expect(await at("sql(`SELECT\n  FROM |")).toMatchObject({
		raw: "SELECT\n  FROM ",
	});
	// an escaped quote does not end it
	expect(await at(`sql("a \\"|`)).toEqual({
		raw: 'a \\"',
		text: 'a  "',
		cursor: 4,
	});
	expect(await at(`sql("a \\\\\\"|`)).toMatchObject({ raw: 'a \\\\\\"' });
});

test("a closing quote after an escaped backslash ends the literal", async () => {
	expect(await at(`sql("a \\\\|");`)).toEqual({
		raw: "a \\\\",
		text: "a   ",
		cursor: 4,
	});
	expect(await at(`sql("a \\\\"|);`)).toBeNull();
	expect(await at(`sql("\\\\\\\\"|);`)).toBeNull();
});

test("escape sequences keep their length: an escaped quote reads as the quote", async () => {
	expect(
		await at(String.raw`sql("a \" b \' c \` d \\ e \n f \u0041 |");`),
	).toMatchObject({
		text: "a  \" b  ' c  ` d    e    f   0041 ",
	});
});

test("`${…}` in a template literal: `$0` padded to its length; the cursor inside one is outside", async () => {
	expect(await at("sql(`a ${x} b ${yy} c|`);")).toEqual({
		raw: "a ${x} b ${yy} c",
		text: "a $0   b $0    c",
		cursor: 16,
	});
	expect(await at("sql(`a ${\n  x\n} b|`);")).toMatchObject({
		text: "a $0       b",
	});
	expect(await at("sql(`a |${x} b`);")).toMatchObject({ cursor: 2 });
	expect(await at("sql(`a ${x}| b`);")).toMatchObject({ cursor: 6 });
	for (const marked of [
		"sql(`a $|{x} b`);",
		"sql(`a ${|x} b`);",
		"sql(`a ${x|} b`);",
	])
		expect(await at(marked)).toBeNull();
});

test("the innermost call with a literal first argument decides", async () => {
	expect(await at(`g("a", sql("SELECT |"));`)).toMatchObject({
		raw: "SELECT ",
	});
	expect(await at(`sql("SELECT |"); f("x");`)).toMatchObject({
		raw: "SELECT ",
	});
	expect(await at("sql(`${f('x')} SELECT |`);")).toMatchObject({
		raw: "${f('x')} SELECT ",
	});
	// inside a `${…}`: a call there, or none
	expect(await at("sql(`SELECT ${f('x', |)}`);")).toBeNull();
	expect(await at("sql(`SELECT ${f(|)}`);")).toBeNull();
	expect(await at(`f(|);`)).toBeNull();
	// a first argument that is no literal
	expect(await at(`sql(abc|);`)).toBeNull();
	expect(await at(`sql(abc, "SELECT |");`)).toBeNull();
});

test("callees: core's Sql and TransactionalSql, called or through .fragment / .as", async () => {
	for (const marked of [
		`tx("SELECT |");`,
		`sql.fragment("WHERE |");`,
		`sql.as<{ n: number }>("SELECT |");`,
		`tx.as("SELECT |");`,
		`tx.fragment("SELECT |");`,
	])
		expect(await at(marked)).not.toBeNull();
	for (const marked of [
		`other("SELECT |");`,
		`other.fragment("SELECT |");`,
		`other.as("SELECT |");`,
		// another method is a callee of its own
		`sql.raw("SELECT |");`,
	])
		expect(await at(marked)).toBeNull();
	// a callee with no DB type argument
	expect(await at(`sql("SELECT |");`, CALLEES, [])).toBeNull();
});

test("a core type: a reference to one of core's declarations named Sql or TransactionalSql", async () => {
	const sqlAs = async (t: Type): Promise<boolean> =>
		(await at(`sql("SELECT |");`, { sql: t })) !== null &&
		(await at(`sql.fragment("SELECT |");`, { sql: t })) !== null;
	expect(await sqlAs(ref("Sql"))).toBe(true);
	expect(await sqlAs(ref("Sql", [CORE], false))).toBe(false);
	expect(await sqlAs(ref(null))).toBe(false);
	expect(await sqlAs(ref("Sqlx"))).toBe(false);
	expect(await sqlAs(ref("Sql", ["/app/src/sql.d.ts"]))).toBe(false);
	// also declared outside core (merged declarations)
	expect(await sqlAs(ref("Sql", ["/app/src/augment.d.ts", CORE]))).toBe(true);
});

test("a position (line and character) or an offset; a file the program does not have", async () => {
	const { program, text } = await parse(`sql("x");\nsql("SELECT |");`);
	const c = checker(() => text, CALLEES).checker;
	const call = await sqlCallAt(
		program,
		c,
		kinds,
		{ uri: "file:///app/src/q.ts" },
		{ line: 1, character: 12 },
		isCorePath,
	);
	expect(call && text.slice(call.start, call.offset)).toBe("SELECT ");
	const none = {
		getSourceFile: async () => undefined,
	} as unknown as Program;
	expect(
		await sqlCallAt(
			none,
			c,
			kinds,
			{ uri: "file:///app/src/q.ts" },
			0,
			isCorePath,
		),
	).toBeNull();
});

test("completionsAt reads the schema only where a name is expected", async () => {
	const complete = async (marked: string) => {
		const { offset, text, program } = await parse(marked);
		const { checker: c, reads } = checker(() => text, CALLEES);
		const r = await completionsAt(
			program,
			c,
			kinds,
			{ uri: "file:///app/src/q.ts" },
			offset,
			isCorePath,
		);
		return { items: r?.items, reads: reads.count };
	};
	expect(await complete(`sql("SELECT * FROM users |");`)).toEqual({
		items: [],
		reads: 0,
	});
	expect(await complete(`sql("SELECT * FROM |");`)).toEqual({
		items: [],
		reads: 1,
	});
});
