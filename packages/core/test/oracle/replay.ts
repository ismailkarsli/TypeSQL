import postgres from "postgres";

export const ROW_CAP = 1000;

export interface Described {
	readonly columns: readonly { readonly name: string; readonly type: number }[];
	readonly params: readonly number[];
}

export interface ServerError {
	readonly code: string;
	readonly message: string;
}

export type Ran =
	| { readonly rows: readonly (readonly unknown[])[]; readonly count: number }
	| { readonly error: ServerError };

export interface Replayed {
	readonly text: string;
	readonly describe: Described | { readonly error: ServerError };
	readonly run: Ran;
}

export class Connection {
	readonly sql: postgres.Sql;

	constructor(
		url: string,
		options: {
			readonly statementTimeoutMs?: number;
			readonly settings?: { readonly [name: string]: string };
		} = {},
	) {
		this.sql = postgres(url, {
			max: 1,
			prepare: false,
			fetch_types: true,
			idle_timeout: 0,
			onnotice: () => undefined,
			types: {
				json: {
					to: 114,
					from: [114, 3802],
					serialize: (x: unknown) => String(x),
					parse: (x: string) => x,
				},
			},
			connection: {
				application_name: "typesql-oracle",
				statement_timeout: options.statementTimeoutMs ?? 10_000,
				...options.settings,
			},
		});
	}

	close(): Promise<void> {
		return this.sql.end({ timeout: 5 });
	}

	async runScript(text: string, copyData?: string): Promise<Ran> {
		const rows: unknown[][] = [];
		let count = 0;
		try {
			await this.sql
				.unsafe(copyViaProgram(text, copyData))
				.simple()
				.values()
				.forEach((row: unknown) => {
					if (count++ < ROW_CAP) rows.push(row as unknown[]);
				});
			return { rows, count };
		} catch (e) {
			return { error: serverError(e) };
		}
	}

	async exec(text: string): Promise<void> {
		await this.sql.unsafe(text);
	}

	async tryExec(text: string): Promise<ServerError | null> {
		try {
			await this.sql.unsafe(text);
			return null;
		} catch (e) {
			return serverError(e);
		}
	}

	async describe(
		text: string,
	): Promise<Described | { readonly error: ServerError }> {
		try {
			const d = await this.sql.unsafe(text).describe();
			return {
				columns: (d.columns ?? []).map((c) => ({ name: c.name, type: c.type })),
				params: [...(d.types ?? [])],
			};
		} catch (e) {
			return { error: serverError(e) };
		}
	}

	async run(
		text: string,
		params: readonly (string | null)[] = [],
	): Promise<Ran> {
		const rows: unknown[][] = [];
		let count = 0;
		try {
			await this.sql
				.unsafe(text, params as never[])
				.values()
				.forEach((row: unknown) => {
					if (count++ < ROW_CAP) rows.push(row as unknown[]);
				});
			return { rows, count };
		} catch (e) {
			return { error: serverError(e) };
		}
	}

	async typeName(oid: number, depth = 0): Promise<string> {
		if (depth > 5) return `oid:${oid}`;
		const [t] = await this.sql.unsafe<
			{
				typname: string;
				typtype: string;
				typcategory: string;
				typelem: number;
				typbasetype: number;
			}[]
		>(
			"SELECT typname::text AS typname, typtype::text AS typtype, typcategory::text AS typcategory, typelem::int4 AS typelem, typbasetype::int4 AS typbasetype FROM pg_type WHERE oid = $1",
			[oid],
		);
		if (!t) return `oid:${oid}`;
		if (t.typtype === "d") return this.typeName(t.typbasetype, depth + 1);
		if (t.typcategory === "A" && t.typelem !== 0 && t.typname.startsWith("_"))
			return `${await this.typeName(t.typelem, depth + 1)}[]`;
		return t.typname;
	}
}

export function serverError(e: unknown): ServerError {
	const err = e as { code?: string; message?: string };
	return {
		code: typeof err.code === "string" ? err.code : "?????",
		message: err.message ?? String(e),
	};
}

export const isRejection = (e: ServerError): boolean =>
	!/^(53|54|57|58|XX)/.test(e.code);

export async function replay(
	conn: Connection,
	statements: readonly string[],
	onEach?: (r: Replayed, i: number) => void | Promise<void>,
): Promise<Replayed[]> {
	const out: Replayed[] = [];
	for (const [i, text] of statements.entries()) {
		const describe = await conn.describe(text);
		const run = await conn.run(text);
		const r: Replayed = { text, describe, run };
		out.push(r);
		await onEach?.(r, i);
	}
	return out;
}

export function copyViaProgram(text: string, copyData = ""): string {
	if (!/^\s*copy\b/i.test(text)) return text;
	const from = /\bfrom\s+(stdin|stdout)\b/i;
	if (from.test(text))
		return text.replace(
			from,
			`FROM PROGRAM 'echo ${Buffer.from(copyData).toString("base64")} | base64 -d'`,
		);
	return text.replace(/\bto\s+stdout\b/i, "TO PROGRAM 'cat > /dev/null'");
}
