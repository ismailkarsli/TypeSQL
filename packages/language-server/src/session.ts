import { realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { API, Snapshot } from "typescript/async";
import type { EditorKinds } from "./complete/call.js";
import {
	type Completions,
	completionsAt,
	editorKinds,
} from "./complete/index.js";
import { CorePaths } from "./core.js";
import { type Highlight, highlightsIn } from "./highlight/index.js";

export interface TypeScriptModules {
	readonly API: typeof API;
	readonly SyntaxKind: Readonly<Record<string, number>>;
	readonly dir: string;
	readonly version: string;
}

export interface Connector {
	pipe(): Promise<string>;
	modules(fileName: string): readonly (() => Promise<TypeScriptModules>)[];
	readonly upgrade?: string;
}

export async function typescriptModules(
	from: string,
): Promise<TypeScriptModules> {
	const req = createRequire(from);
	const manifest = req.resolve("typescript/package.json");
	const load = async (spec: string): Promise<Record<string, unknown>> =>
		(await import(pathToFileURL(req.resolve(spec)).href)) as Record<
			string,
			unknown
		>;
	const pkg = req(manifest) as { version?: string };
	const [api, ast] = await Promise.all([
		load("typescript/async"),
		load("typescript/ast"),
	]).catch((e: unknown) => {
		throw new Error(
			`typescript ${pkg.version ?? "unknown"} at ${realpathSync(dirname(manifest))} has no API client (completions need TypeScript 7.1)`,
			{ cause: e },
		);
	});
	return {
		API: api.API as typeof API,
		SyntaxKind: ast.SyntaxKind as Record<string, number>,
		dir: realpathSync(dirname(manifest)),
		version: pkg.version ?? "unknown",
	};
}

export interface Position {
	readonly line: number;
	readonly character: number;
}

interface Connection {
	readonly api: API<true>;
	readonly kinds: EditorKinds;
}

const IS_7_0 = /unknown API method "getCurrentLanguageServerSnapshot"/;

export class Session {
	private connection: Promise<Connection | null> | undefined;
	private readonly cores: CorePaths;
	private readonly connector: Connector;
	private readonly log: (message: string) => void;

	constructor(connector: Connector, log: (message: string) => void) {
		this.connector = connector;
		this.log = log;
		this.cores = new CorePaths(log);
	}

	private connect(uri: string, fileName: string): Promise<Connection | null> {
		this.connection ??= this.open(uri, fileName).catch((e: unknown) => {
			this.connection = undefined;
			throw e;
		});
		return this.connection;
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
				const snapshot = await api.getCurrentLanguageServerSnapshot();
				try {
					const project = await snapshot.getDefaultProjectForFile({ uri });
					if (project)
						await Promise.all([
							project.program.getSourceFile({ uri }),
							project.checker.getStringType(),
						]);
				} finally {
					void snapshot.dispose();
				}
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

	async complete(
		uri: string,
		position: Position,
		text?: string,
	): Promise<Completions | null> {
		if (!uri.startsWith("file:")) return null;
		const fileName = fileURLToPath(uri);
		const isCorePath = this.cores.for(fileName);
		if (!isCorePath) return null;
		const connection = await this.connect(uri, fileName);
		if (!connection) return null;
		const { api, kinds } = connection;
		const run = async (s: Snapshot): Promise<Completions | null> => {
			const project = await s.getDefaultProjectForFile({ uri });
			if (!project) return null;
			return completionsAt(
				project.program,
				project.checker,
				kinds,
				{ uri },
				position,
				isCorePath,
			);
		};
		const snapshot = await api.getCurrentLanguageServerSnapshot();
		try {
			if (text !== undefined) {
				const project = await snapshot.getDefaultProjectForFile({ uri });
				const current = await project?.program.getSourceFile({ uri });
				if (current && current.text !== text) {
					let result: Completions | null = null;
					await api.runWithTemporaryFileUpdate(
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
			return await run(snapshot);
		} finally {
			void snapshot.dispose();
		}
	}

	/**
	 * SQL highlights for `uri` as the language server sees it, or null when the
	 * file can't reach @typesql/core or has no project.
	 */
	async highlight(uri: string): Promise<Highlight[] | null> {
		if (!uri.startsWith("file:")) return null;
		const fileName = fileURLToPath(uri);
		const isCorePath = this.cores.for(fileName);
		if (!isCorePath) return null;
		const connection = await this.connect(uri, fileName);
		if (!connection) return null;
		const snapshot = await connection.api.getCurrentLanguageServerSnapshot();
		try {
			const project = await snapshot.getDefaultProjectForFile({ uri });
			if (!project) return null;
			return await highlightsIn(
				project.program,
				project.checker,
				connection.kinds,
				{ uri },
				isCorePath,
			);
		} finally {
			void snapshot.dispose();
		}
	}

	async close(): Promise<void> {
		const c = this.connection;
		this.connection = undefined;
		const connection = await c?.catch(() => undefined);
		await connection?.api.close().catch(() => {});
	}
}
