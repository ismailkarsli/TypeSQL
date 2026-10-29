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
	const load = (spec: string): Promise<Record<string, unknown>> =>
		import(pathToFileURL(req.resolve(spec)).href) as Promise<
			Record<string, unknown>
		>;
	const [api, ast, pkg] = await Promise.all([
		load("typescript/async"),
		load("typescript/ast"),
		Promise.resolve(req(manifest) as { version?: string }),
	]);
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
			} catch {
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

	async close(): Promise<void> {
		const c = this.connection;
		this.connection = undefined;
		const connection = await c?.catch(() => undefined);
		await connection?.api.close().catch(() => {});
	}
}
