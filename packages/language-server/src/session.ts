import { realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { API, Snapshot } from "typescript/async";
import type { TypeScriptModuleLoader } from "typescript/vscode";
import { type EditorKinds, editorKinds } from "./call.js";
import { type Completions, completionsAt } from "./complete/complete.js";
import { CorePaths } from "./core.js";
import { type Highlight, highlightsIn } from "./highlight/index.js";
import { mayBeInSqlLiteral, offsetOf, type Position } from "./literal.js";

export interface TypeScriptModules {
	readonly API: typeof API;
	readonly SyntaxKind: Readonly<Record<string, number | string>>;
	readonly dir: string;
	readonly version: string;
}

/** The API modules `loader` imports, from the TypeScript package at `dir`. */
export async function typescriptModules(
	loader: TypeScriptModuleLoader,
	dir: string,
	version: string,
): Promise<TypeScriptModules> {
	try {
		const [api, ast] = await Promise.all([
			loader.importModule("typescript/async"),
			loader.importModule("typescript/ast"),
		]);
		return { API: api.API, SyntaxKind: ast.SyntaxKind, dir, version };
	} catch (e) {
		throw new Error(
			`typescript ${version} at ${dir} has no API client (completions need TypeScript 7.1)`,
			{ cause: e },
		);
	}
}

/** The API modules of the TypeScript package that `from` resolves. */
export async function typescriptModulesFrom(
	from: string,
): Promise<TypeScriptModules> {
	const req = createRequire(from);
	const manifest = req.resolve("typescript/package.json");
	const pkg: { version?: string } = req(manifest);
	return typescriptModules(
		{ importModule: (spec) => import(pathToFileURL(req.resolve(spec)).href) },
		realpathSync(dirname(manifest)),
		pkg.version ?? "unknown",
	);
}

export interface Connector {
	pipe(): Promise<string>;
	modules(fileName: string): readonly (() => Promise<TypeScriptModules>)[];
	readonly upgrade?: string;
}

export type Log = (
	message: string,
	level?: "trace" | "info" | "warn" | "error",
) => void;

interface Connection {
	readonly api: API<true>;
	readonly kinds: EditorKinds;
}

/**
 * The session's link to the language server's API:
 *
 *     none -> opening -> open -> none (the connection was lost)
 *               |    \-> unavailable (nothing to connect with, until a restart)
 *               \-> none (opening failed; the next request tries again)
 *
 * and from any of them to closed, which is final.
 */
type Link =
	| { readonly state: "none" }
	| {
			readonly state: "opening";
			readonly opened: Promise<Connection | null>;
	  }
	| { readonly state: "open"; readonly connection: Connection }
	| { readonly state: "unavailable" }
	| { readonly state: "closed" };

/** What one request needs: the connection, and which files are @typesql/core's. */
interface Request extends Connection {
	readonly isCorePath: (path: string) => boolean;
}

const COMPLETION_BUDGET_MS = 150;
const HIGHLIGHT_BUDGET_MS = 500;

const IS_7_0 = /unknown API method "getCurrentLanguageServerSnapshot"/;

export class Session {
	private link: Link = { state: "none" };
	private readonly cores: CorePaths;
	private readonly connector: Connector;
	private readonly log: Log;

	constructor(connector: Connector, log: Log) {
		this.connector = connector;
		this.log = log;
		this.cores = new CorePaths(log);
	}

	/**
	 * Tables and columns at `position` of `uri`, whose text is `text` when the
	 * editor has it. Null when there are none, or when they fail or take longer
	 * than the budget, which is logged.
	 */
	complete(
		uri: string,
		position: Position,
		text?: string,
	): Promise<Completions | null> {
		if (
			text !== undefined &&
			!mayBeInSqlLiteral(text, offsetOf(text, position))
		)
			return Promise.resolve(null);
		return this.within(
			"completions",
			COMPLETION_BUDGET_MS,
			async () => {
				const r = await this.request(uri);
				return r && this.completeIn(r, uri, position, text);
			},
			(c) => `${c.items.length} items`,
		);
	}

	/**
	 * SQL highlights for `uri` as the language server sees it. Null when the
	 * file can't reach @typesql/core or has no project, or as `complete`.
	 */
	highlight(uri: string): Promise<Highlight[] | null> {
		return this.within(
			"SQL highlighting",
			HIGHLIGHT_BUDGET_MS,
			async () => {
				const r = await this.request(uri);
				if (!r) return null;
				return this.withSnapshot(r.api, async (s) => {
					const project = await s.getDefaultProjectForFile({ uri });
					if (!project) return null;
					return highlightsIn(
						project.program,
						project.checker,
						r.kinds,
						{ uri },
						r.isCorePath,
					);
				});
			},
			(h) => `${h.length} SQL highlights`,
		);
	}

	async close(): Promise<void> {
		const link = this.link;
		this.link = { state: "closed" };
		const connection =
			link.state === "open"
				? link.connection
				: link.state === "opening"
					? await link.opened.catch(() => null)
					: null;
		await connection?.api.close().catch(() => {});
	}

	private async within<T>(
		what: string,
		ms: number,
		run: () => Promise<T | null>,
		count: (result: T) => string,
	): Promise<T | null> {
		let timer: NodeJS.Timeout | undefined;
		const late = new Promise<"late">((resolve) => {
			timer = setTimeout(() => resolve("late"), ms);
		});
		try {
			const started = Date.now();
			const result = await Promise.race([run(), late]);
			if (result === "late") {
				this.log(`${what} took longer than ${ms} ms; skipped`, "warn");
				return null;
			}
			if (result !== null)
				this.log(`${count(result)} in ${Date.now() - started} ms`, "trace");
			return result;
		} catch (e) {
			this.log(
				e instanceof Error ? (e.stack ?? e.message) : String(e),
				"error",
			);
			return null;
		} finally {
			clearTimeout(timer);
		}
	}

	private async request(uri: string): Promise<Request | null> {
		if (!uri.startsWith("file:")) return null;
		const fileName = fileURLToPath(uri);
		const isCorePath = this.cores.for(fileName);
		if (!isCorePath) return null;
		const connection = await this.connected(uri, fileName);
		return connection && { ...connection, isCorePath };
	}

	private connected(uri: string, fileName: string): Promise<Connection | null> {
		const link = this.link;
		switch (link.state) {
			case "none":
				return this.connect(uri, fileName);
			case "opening":
				return link.opened;
			case "open":
				return Promise.resolve(link.connection);
			case "unavailable":
			case "closed":
				return Promise.resolve(null);
		}
	}

	private connect(uri: string, fileName: string): Promise<Connection | null> {
		const opened = this.open(uri, fileName);
		const link: Link = { state: "opening", opened };
		this.link = link;
		// Closing while it opens leaves closed as it is, and closes what opens.
		const settle = (next: Link): void => {
			if (this.link === link) this.link = next;
		};
		void opened.then(
			(connection) =>
				settle(
					connection ? { state: "open", connection } : { state: "unavailable" },
				),
			() => settle({ state: "none" }),
		);
		return opened;
	}

	/** `api` no longer answers: close it, and let the next request open another. */
	private lost(api: API<true>): void {
		const link = this.link;
		if (link.state !== "open" || link.connection.api !== api) return;
		this.link = { state: "none" };
		void api.close().catch(() => {});
	}

	private async completeIn(
		r: Request,
		uri: string,
		position: Position,
		text: string | undefined,
	): Promise<Completions | null> {
		const run = async (s: Snapshot): Promise<Completions | null> => {
			const project = await s.getDefaultProjectForFile({ uri });
			if (!project) return null;
			return completionsAt(
				project.program,
				project.checker,
				r.kinds,
				{ uri },
				position,
				r.isCorePath,
			);
		};
		return this.withSnapshot(r.api, async (snapshot) => {
			if (text !== undefined) {
				const project = await snapshot.getDefaultProjectForFile({ uri });
				const current = await project?.program.getSourceFile({ uri });
				if (current && current.text !== text) {
					let result: Completions | null = null;
					await r.api.runWithTemporaryFileUpdate(
						snapshot,
						{ uri },
						text,
						async (s) => {
							result = await run(s);
						},
					);
					return result;
				}
			}
			return run(snapshot);
		});
	}

	private async withSnapshot<T>(
		api: API<true>,
		run: (s: Snapshot) => Promise<T>,
	): Promise<T> {
		let snapshot: Snapshot;
		try {
			snapshot = await api.getCurrentLanguageServerSnapshot();
		} catch (e) {
			this.lost(api);
			throw e;
		}
		try {
			return await run(snapshot);
		} finally {
			// With the connection gone it rejects, and nobody is left to care.
			void snapshot.dispose().catch(() => {});
		}
	}

	private async open(
		uri: string,
		fileName: string,
	): Promise<Connection | null> {
		const tried = new Set<string>();
		const failures: string[] = [];
		for (const candidate of this.connector.modules(fileName)) {
			let ts: TypeScriptModules;
			try {
				ts = await candidate();
			} catch (e) {
				// A TypeScript package found but too old to load is worth reporting.
				const cause = e instanceof Error ? e.message : "";
				if (cause.includes("has no API client")) failures.push(cause);
				continue;
			}
			if (tried.has(ts.dir)) continue;
			tried.add(ts.dir);
			const api = await ts.API.fromLSPConnection({
				pipe: await this.connector.pipe(),
			});
			try {
				await this.withSnapshot(api, async (snapshot) => {
					const project = await snapshot.getDefaultProjectForFile({ uri });
					if (project)
						await Promise.all([
							project.program.getSourceFile({ uri }),
							project.checker.getStringType(),
						]);
				});
				this.log(
					`API session open (client: typescript ${ts.version} at ${ts.dir})`,
				);
				return { api, kinds: editorKinds(ts.SyntaxKind) };
			} catch (e) {
				void api.close().catch(() => {});
				if (IS_7_0.test(String(e))) {
					this.log(
						`the language server runs TypeScript 7.0, whose API cannot read the editor's program: completions need TypeScript 7.1.${this.connector.upgrade ? ` ${this.connector.upgrade}` : ""}`,
					);
					return null;
				}
				failures.push(
					`typescript ${ts.version} at ${ts.dir}: ${e instanceof Error ? e.message : String(e)}`,
				);
			}
		}
		this.log(
			`no TypeScript API client matches the language server; completions are off until it restarts. Tried:\n  ${failures.join("\n  ") || "(no TypeScript 7.1 package found)"}`,
		);
		return null;
	}
}
