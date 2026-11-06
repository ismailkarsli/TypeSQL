// What the `typesql` commands share: their output, their error messages, and
// the shell of `typesql introspect`, whose dialects live in the adapters.
// Node's modules are reached through process.getBuiltinModule() when a
// command runs, so importing this module needs none.

/** Where a command writes, and the process it runs in. */
export interface CommandIo {
	readonly stdout: (s: string) => void;
	readonly stderr: (s: string) => void;
	readonly cwd?: string | undefined;
	readonly env?: Readonly<Record<string, string | undefined>> | undefined;
}

/** A command's io with the process's for what it leaves out. */
export interface CommandEnv {
	readonly stdout: (s: string) => void;
	readonly stderr: (s: string) => void;
	readonly cwd: string;
	readonly env: Readonly<Record<string, string | undefined>>;
}

/** `io` with the process's output, directory and environment for what it leaves out. */
export const commandIo = (io?: CommandIo): CommandEnv => ({
	stdout: io?.stdout ?? ((s) => process.stdout.write(s)),
	stderr: io?.stderr ?? ((s) => process.stderr.write(s)),
	cwd: io?.cwd ?? process.cwd(),
	env: io?.env ?? process.env,
});

/**
 * The message of an error, without its `typesql: ` prefix. pg rejects a
 * refused `localhost` connection (IPv4 and IPv6) with an AggregateError
 * whose own message is empty: its errors' messages stand for it.
 */
export function errorMessage(cause: unknown): string {
	if (!(cause instanceof Error)) return String(cause);
	const text = cause.message
		? cause.message
		: cause instanceof AggregateError && cause.errors.length > 0
			? Array.from(new Set(cause.errors.map(errorMessage))).join("; ")
			: "code" in cause && typeof cause.code === "string"
				? cause.code
				: cause.name;
	return text.replace(/^typesql: /, "");
}

/** Whether `error` carries the `code` Node and the database drivers set. */
export function hasCode(
	error: unknown,
	code: string,
): error is { readonly code: string } {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		error.code === code
	);
}

/** A mistake in a command's arguments: exit code 2. */
export class UsageError extends Error {}

/** A repeated, comma-separated option's values, trimmed. */
export const listOption = (values: readonly string[] | undefined): string[] =>
	(values ?? []).flatMap((value) =>
		value
			.split(",")
			.map((item) => item.trim())
			.filter(Boolean),
	);

/** The connection URL: `--url`, else `DATABASE_URL`. */
export function databaseUrl(url: string | undefined, io: CommandEnv): string {
	const found = url ?? io.env.DATABASE_URL;
	if (!found) throw new UsageError("pass --url or set DATABASE_URL");
	return found;
}

export function introspectArgs<V extends { readonly help?: boolean }>(
	io: CommandIo,
	usage: string,
	parse: () => { readonly values: V; readonly positionals: string[] },
): V | number {
	let parsed: ReturnType<typeof parse>;
	try {
		parsed = parse();
	} catch (err) {
		io.stderr(`${errorMessage(err)}\n\n${usage}`);
		return 2;
	}
	const { values, positionals } = parsed;
	if (values.help || positionals.length === 0) {
		(values.help ? io.stdout : io.stderr)(usage);
		return values.help ? 0 : 2;
	}
	if (positionals[0] !== "introspect" || positionals.length > 1) {
		io.stderr(`unknown command: ${positionals.join(" ")}\n\n${usage}`);
		return 2;
	}
	return values;
}

/** What a dialect's `introspect` writes: the schema's source, and where. */
export interface IntrospectOutput {
	readonly source: string;
	/** The file to write; stdout without one. */
	readonly out?: string | undefined;
	/** The directory `out` is relative to; default: the working directory. */
	readonly base?: string | undefined;
}

/**
 * `typesql introspect` for one dialect: `parse` reads the arguments, and
 * `run` reads the database and writes the schema's source.
 */
export function introspectCommand<V extends { readonly help?: boolean }>(
	usage: string,
	parse: (argv: string[]) => {
		readonly values: V;
		readonly positionals: string[];
	},
	run: (values: V, io: CommandEnv) => Promise<IntrospectOutput>,
): (argv: readonly string[], io?: CommandIo) => Promise<number> {
	return async (argv, given) => {
		const io = commandIo(given);
		const values = introspectArgs(io, usage, () => parse([...argv]));
		if (typeof values === "number") return values;
		try {
			const { source, out, base } = await run(values, io);
			if (out === undefined) io.stdout(source);
			else {
				const { mkdir, writeFile } =
					process.getBuiltinModule("node:fs/promises");
				const { dirname, resolve } = process.getBuiltinModule("node:path");
				const file = resolve(base ?? io.cwd, out);
				await mkdir(dirname(file), { recursive: true });
				await writeFile(file, source);
				io.stderr(`typesql introspect: wrote ${out}\n`);
			}
			return 0;
		} catch (err) {
			io.stderr(`typesql introspect: ${errorMessage(err)}\n`);
			return err instanceof UsageError ? 2 : 1;
		}
	};
}
