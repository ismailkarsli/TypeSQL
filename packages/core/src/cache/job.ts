import { type FSWatcher, watch } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import type { Checker, Type } from "typescript/async";
import type { CacheDialect } from "./dialect.js";
import { discover } from "./discover.js";
import {
	badDeclarations,
	declarations,
	declTypes,
	evaluateAnalyses,
	lineOf,
	ProbeSession,
	probeHead,
} from "./evaluate.js";
import {
	type CacheFile,
	type CallEntry,
	canonical,
	type DdlEntry,
	type Snapshot as DepSnapshot,
	type Entry,
	type Group,
	hash,
	render,
} from "./format.js";
import { coreNames, names, Printer } from "./print.js";
import { scanNames } from "./scan.js";
import {
	type Contribution,
	ddlEntryId,
	groupEntryId,
	merge,
	readCache,
	withLock,
	writeCache,
} from "./store.js";

export interface JobOptions {
	readonly configFile: string;
	readonly cacheFile: string;
	readonly dialect: CacheDialect;
	readonly engine: string;
	readonly isCorePath: (path: string) => boolean;
	readonly log?: (message: string) => void;
}

export interface PassResult {
	readonly statements: number;
	readonly computed: number;
	readonly reused: number;
	readonly dropped: number;
	readonly written: boolean;
	readonly ms: number;
}

const MISSING = "__T.Missing";
const lit = (s: string): string => JSON.stringify(s);

export class Session {
	private readonly session: ProbeSession;
	readonly probe: string;
	private readonly o: JobOptions;

	constructor(o: JobOptions) {
		this.o = o;
		this.probe = join(dirname(o.cacheFile), "__typesql_probe__.ts");
		this.session = new ProbeSession(o.configFile, this.probe);
	}

	markChanged(files: Iterable<string>): void {
		this.session.markChanged(files);
	}

	close(): Promise<void> {
		return this.session.close();
	}

	dispose(): Promise<void> {
		return this.session.dispose();
	}

	private log(m: string): void {
		this.o.log?.(m);
	}

	private withProbe(probe: string) {
		return this.session.withProbe(probe).catch((e: Error) => {
			if (/is not in a directory the project includes/.test(e.message))
				throw new Error(
					`typesql: ${relative(dirname(this.o.configFile), this.o.cacheFile)} is not in a directory the project includes .ts files from`,
				);
			throw e;
		});
	}

	async pass(): Promise<PassResult> {
		const started = performance.now();
		const o = this.o;
		const owner = relative(dirname(o.cacheFile), o.configFile)
			.split(sep)
			.join("/");
		const existing = readCache(o.cacheFile, o.dialect.name, o.engine);
		const kinds = (await this.session.typescript()).kinds;

		let { program, checker, sf } = await this.withProbe(probeHead(o.dialect));
		let printer = new Printer(checker, sf, o.isCorePath);
		const print = async (t: Type): Promise<string> =>
			coreNames(await printer.print(t), o.dialect.specifiers);
		const include = (f: string): boolean =>
			f !== this.probe &&
			!f.endsWith(".d.ts") &&
			!/[\\/]node_modules[\\/]/.test(f) &&
			!o.isCorePath(f);
		const sites = await discover(
			program,
			checker,
			kinds,
			o.isCorePath,
			include,
			o.dialect,
		);
		const decl = declarations(sf, kinds);
		const fc = await checker.getTypeAtLocation(decl.get("__fc")!);

		const probeText = async (t: Type): Promise<string | null> => {
			const text = await print(t);
			const bare = names(text).filter((n) => !n.startsWith("import:"));
			if (!(await anyLocal(printer, bare))) return text;
			if (!t.isObjectType()) return null;
			const members: string[] = [];
			for (const p of await checker.getPropertiesOfType(t))
				members.push(
					`${lit(p.name)}: ${await print(await checker.getTypeOfSymbol(p))}`,
				);
			return `{ ${members.join("; ")} }`;
		};
		const snap = async (t: Type | undefined): Promise<string | null> =>
			t
				? printer
						.snapshot(t)
						.then((s) =>
							s === null ? null : coreNames(s, o.dialect.specifiers),
						)
				: MISSING;
		const prop = async (
			t: Type | undefined,
			name: string,
		): Promise<Type | undefined> => {
			if (!t) return undefined;
			const s = await checker.getPropertyOfType(t, name);
			return s ? checker.getTypeOfSymbol(s) : undefined;
		};
		const catalogCache = new Map<string, Promise<string | null>>();
		const catalog = (w: string): Promise<string | null> => {
			let v = catalogCache.get(w);
			if (!v) {
				v = checker.getPropertyOfType(fc, w).then(async (s) => {
					if (!s) return MISSING;
					if (
						s.declarations.length &&
						s.declarations.every((d) => o.isCorePath(d.path))
					)
						return "__T.Builtin";
					return snap(await checker.getTypeOfSymbol(s));
				});
				catalogCache.set(w, v);
			}
			return v;
		};
		const depSnapshot = async (
			db: Type,
			ws: Iterable<string>,
			ps: Iterable<string>,
		): Promise<{
			t: string | null;
			w: Map<string, readonly [string, string, string, string] | null>;
			q: Map<string, string | null>;
		}> => {
			const [pg, fns, types] = await Promise.all([
				prop(db, "pg_catalog"),
				prop(db, "$functions"),
				prop(db, "$types"),
			]);
			const w = new Map<
				string,
				readonly [string, string, string, string] | null
			>();
			await Promise.all(
				[...ws].map(async (word) => {
					const parts = await Promise.all([
						prop(db, word).then(snap),
						prop(pg, word).then(snap),
						prop(fns, word).then(snap),
						catalog(word),
					]);
					w.set(
						word,
						parts.every((p): p is string => p !== null)
							? (parts as unknown as readonly [string, string, string, string])
							: null,
					);
				}),
			);
			const q = new Map<string, string | null>();
			await Promise.all(
				[...ps].map(async (pair) => {
					const [a, b] = pair.split(".") as [string, string];
					q.set(pair, await prop(await prop(db, a), b).then(snap));
				}),
			);
			return { t: types ? await snap(types) : "{}", w, q };
		};

		interface G {
			id: string;
			db: Type;
			text: string;
			words: Set<string>;
			pairs: Set<string>;
			dep?: Awaited<ReturnType<typeof depSnapshot>>;
		}
		const groups = new Map<string, G>();
		const groupOf = new Map<number, G | null>();
		const maps = new Map<
			number,
			{ probe: string; snapshot: string; id: string } | null
		>();
		interface Site {
			key: string;
			g: G;
			map: { probe: string; snapshot: string; id: string } | null;
			keys: string;
			slots: string | null;
			extraWords: string[];
		}
		const calls: Site[] = [];
		const typeSites: Site[] = [];
		const groupFor = async (db: Type): Promise<G | null> => {
			if (!groupOf.has(db.id)) {
				const text = await probeText(db);
				if (text === null) groupOf.set(db.id, null);
				else {
					const id = hash(text);
					const g = groups.get(id) ?? {
						id,
						db,
						text,
						words: new Set(),
						pairs: new Set(),
					};
					groups.set(id, g);
					groupOf.set(db.id, g);
				}
			}
			return groupOf.get(db.id) ?? null;
		};
		const addWords = (g: G, texts: readonly string[]): void => {
			for (const text of texts) {
				const n = scanNames(text);
				for (const x of n.words) g.words.add(x);
				for (const x of n.pairs) g.pairs.add(x);
			}
		};
		for (const s of sites.types) {
			const g = await groupFor(s.db);
			if (!g) continue;
			typeSites.push({
				key: s.key,
				g,
				map: null,
				keys: "",
				slots: null,
				extraWords: [],
			});
			addWords(g, [s.key]);
		}
		for (const s of sites.sql) {
			const g = await groupFor(s.db);
			if (!g) continue;
			if (!maps.has(s.tm.id)) {
				const [p, sn] = await Promise.all([
					probeText(s.tm),
					snapshotTypeMap(checker, printer, s.tm, o.dialect.specifiers),
				]);
				maps.set(
					s.tm.id,
					p !== null && sn !== null
						? { probe: p, snapshot: sn, id: hash(sn) }
						: null,
				);
			}
			const slots = s.slots ? await probeText(s.slots) : null;
			if (s.slots && slots === null) continue;
			const extraWords = slots ? stringLiterals(slots) : [];
			calls.push({
				key: s.key,
				g,
				map: maps.get(s.tm.id) ?? null,
				keys: await print(s.keys),
				slots,
				extraWords,
			});
			addWords(g, [s.key, ...extraWords]);
		}
		for (const g of groups.values())
			g.dep = await depSnapshot(g.db, g.words, g.pairs);

		interface D {
			key: string;
			db: string;
			d: DdlEntry["d"];
			r: string[];
		}
		const steps: D[] = [];
		const seenSteps = new Set<string>();
		for (const s of sites.ddl) {
			const full = await snap(s.db);
			if (full === null) continue;
			const id = `${s.key}\0${full}`;
			if (seenSteps.has(id)) continue;
			seenSteps.add(id);
			const n = scanNames(s.key);
			const dep = await depSnapshot(s.db, n.words, n.pairs);
			if (
				dep.t === null ||
				[...dep.w.values(), ...dep.q.values()].some((v) => v === null)
			)
				continue;
			const all = o.dialect.touchesAllTables(s.key);
			steps.push({
				key: s.key,
				db: full,
				d: {
					t: dep.t,
					w: Object.fromEntries(dep.w) as DepSnapshot["w"],
					q: Object.fromEntries(dep.q) as DepSnapshot["q"],
					...(all ? { all: full } : {}),
				},
				r: [...n.words, ...n.pairs, "*", ...(all ? ["!all"] : [])],
			});
		}

		const fresh = (g: G, deps: readonly string[]): boolean => {
			const old = existing.groups[g.id];
			if (!old || !g.dep || old.t !== g.dep.t || deps.includes("!h"))
				return false;
			return deps.every(
				(x) =>
					x === "*" ||
					(g.dep!.w.has(x)
						? sameTuple(old.w[x], g.dep!.w.get(x))
						: g.dep!.q.has(x) && old.q[x] === g.dep!.q.get(x)),
			);
		};
		const entries = new Map<
			string,
			Map<string, { r: string[]; t?: string; a?: string; c: CallEntry[] }>
		>();
		const entryFor = (g: G, key: string, r: string[]) => {
			const m = entries.get(g.id) ?? new Map();
			entries.set(g.id, m);
			let e = m.get(key);
			if (!e) {
				e = { r, c: [] };
				m.set(key, e);
			}
			return e;
		};
		let reused = 0;
		const ddlKept: { [key: string]: DdlEntry[] } = {};
		const texts = new Map<Site, string>();
		for (const s of typeSites) texts.set(s, s.key);
		const needCall: Site[] = [];
		for (const site of calls) {
			const old = existing.groups[site.g.id]?.entries[site.key];
			const variant =
				site.map &&
				old?.c?.find((c) => c.m === site.map!.id && c.k === site.keys);
			if (old && variant && fresh(site.g, old.r) && !site.slots) {
				const e = entryFor(site.g, site.key, [...old.r]);
				if (old.a) e.a = old.a;
				if (old.t) e.t = old.t;
				if (!e.c.some((c: CallEntry) => c.m === variant.m && c.k === variant.k))
					e.c.push(variant);
				texts.set(site, old.t ?? site.key);
				reused++;
			} else needCall.push(site);
		}

		let probe = probeHead(o.dialect);
		for (const g of groups.values())
			probe += `type DB_${g.id} = ${g.text};\nexport declare const __h_${g.id}: __T.HintIndex<DB_${g.id}> & string;\n`;
		const mapIds = new Map<string, string>();
		for (const m of maps.values())
			if (m && !mapIds.has(m.id))
				mapIds.set(m.id, m.probe), (probe += `type TM_${m.id} = ${m.probe};\n`);
		needCall.forEach((s, i) => {
			if (s.slots)
				probe += `type S_${i} = ${s.slots};\nexport declare const __s_${i}: __T.SplicedText<${lit(s.key)}, S_${i}>;\n`;
			else if (s.map)
				probe += `export declare const __c_${i}: __T.CallTypes<DB_${s.g.id}, TM_${s.map.id}, ${s.keys}, ${lit(s.key)}>;\n`;
		});
		const needStep: D[] = [];
		for (const step of steps) {
			const old = existing.ddl[step.key]?.find(
				(e) => canonical(e.d) === canonical(step.d),
			);
			if (old) {
				const key = step.key;
				ddlKept[key] ??= [];
				ddlKept[key].push(old);
				reused++;
			} else needStep.push(step);
		}
		needStep.forEach((s, i) => {
			probe += `type X_${i} = ${s.db};\nexport declare const __o_${i}: __T.ApplyDdl<X_${i}, ${lit(s.key)}>;\nexport declare const __e_${i}: __T.DdlEffect<X_${i}, __T.ApplyDdl<X_${i}, ${lit(s.key)}>>;\n`;
		});
		({ program, checker, sf } = await this.withProbe(probe));
		printer = new Printer(checker, sf, o.isCorePath);
		const types = await declTypes(checker, sf, kinds);
		const bad = await badDeclarations(program, sf);
		const version = await print(types.get("__v")!);
		if (version !== lit(o.engine))
			throw new Error(
				`typesql: the project's @typesql/core has CacheVersion ${version}, this job ${o.engine}`,
			);
		const hints = new Map<string, string>();
		for (const g of groups.values())
			if (!bad.has(`__h_${g.id}`))
				hints.set(g.id, await print(types.get(`__h_${g.id}`)!));
		let computed = 0;
		await Promise.all(
			needCall.map(async (s, i) => {
				if (s.slots) {
					const t = types.get(`__s_${i}`);
					if (t && !bad.has(`__s_${i}`) && t.isStringLiteralType())
						texts.set(s, t.value);
					return;
				}
				const t = types.get(`__c_${i}`);
				if (!t || bad.has(`__c_${i}`) || !s.map) return;
				const [g, p, q] = await Promise.all(
					["g", "p", "q"].map((k) => prop(t, k)),
				);
				if (!g || !p || !q) return;
				const qArgs = q.isTypeReference()
					? await checker.getTypeArguments(q as never)
					: [];
				const text = qArgs[2]?.isStringLiteralType() ? qArgs[2].value : null;
				if (text === null) return;
				texts.set(s, text);
				const isErr = !(g.flags & 2);
				const e = entryFor(s.g, s.key, depsOf([s.key, ...s.extraWords], isErr));
				if (text !== s.key) e.t = text;
				const call: CallEntry = {
					m: s.map.id,
					k: s.keys,
					g: await print(g),
					p: await print(p),
					q: await print(q),
				};
				if (e.c.some((c: CallEntry) => c.m === call.m && c.k === call.k))
					return;
				e.c.push(call);
				computed++;
			}),
		);
		const ddlNew: { [key: string]: DdlEntry[] } = {};
		await Promise.all(
			needStep.map(async (s, i) => {
				if (bad.has(`__o_${i}`) || bad.has(`__e_${i}`)) return;
				const out = types.get(`__o_${i}`)!;
				const outText = await print(out);
				let entry: DdlEntry;
				if (/^__T\.SqlError</.test(outText))
					entry = { d: s.d, r: s.r, e: outText };
				else {
					const effect = types.get(`__e_${i}`)!;
					const [set, del] = await Promise.all([
						prop(effect, "s"),
						prop(effect, "x"),
					]);
					if (!set || !del) return;
					entry = { d: s.d, r: s.r, s: await print(set), x: await print(del) };
				}
				const key = s.key;
				ddlNew[key] ??= [];
				ddlNew[key].push(entry);
				computed++;
			}),
		);

		const analyses: { g: G; text: string; site: Site }[] = [];
		const seen = new Set<string>();
		for (const [site, text] of texts) {
			const id = `${site.g.id}\0${text}`;
			if (seen.has(id)) continue;
			seen.add(id);
			const old = existing.groups[site.g.id]?.entries[text];
			if (old?.a && fresh(site.g, old.r)) {
				const e = entryFor(site.g, text, [...old.r]);
				e.a = old.a;
				reused++;
			} else analyses.push({ g: site.g, text, site });
		}
		if (analyses.length) {
			const results = await evaluateAnalyses(
				this.session,
				probe,
				analyses.map((a) => ({ db: `DB_${a.g.id}`, text: a.text })),
				o.isCorePath,
				o.dialect,
			);
			analyses.forEach((a, i) => {
				const r = results[i]!;
				if (!("text" in r)) return;
				const isErr = /^__T\.SqlError</.test(r.text);
				if (isErr && /function .* does not exist/.test(r.text)) return;
				const e = entryFor(
					a.g,
					a.text,
					depsOf([a.text, ...a.site.extraWords], isErr),
				);
				e.a = r.text;
				computed++;
			});
		}

		const contribution = (): Contribution => {
			const gs: Record<string, Group> = {};
			for (const [gid, es] of entries) {
				const g = groups.get(gid)!;
				const h = hints.get(gid);
				if (!g.dep || g.dep.t === null || h === undefined) continue;
				const w: Record<string, readonly [string, string, string, string]> = {};
				const q: Record<string, string> = {};
				const out: Record<string, Entry> = {};
				for (const [key, e] of es) {
					if (!e.a && !e.c.length) continue;
					const deps = e.r.filter((x) => x !== "*" && x !== "!h");
					if (
						deps.some((x) =>
							g.dep!.w.has(x)
								? g.dep!.w.get(x) === null
								: g.dep!.q.get(x) === null,
						)
					)
						continue;
					for (const x of deps) {
						if (g.dep.w.has(x)) w[x] = g.dep.w.get(x)!;
						else q[x] = g.dep.q.get(x)!;
					}
					out[key] = {
						r: e.r,
						...(e.t ? { t: e.t } : {}),
						...(e.a ? { a: e.a } : {}),
						...(e.c.length ? { c: e.c } : {}),
					};
				}
				if (Object.keys(out).length)
					gs[gid] = { t: g.dep.t, h, w, q, entries: out };
			}
			const ms: Record<string, string> = {};
			for (const m of maps.values()) if (m) ms[m.id] = m.snapshot;
			const ddl: Record<string, DdlEntry[]> = {};
			for (const [k, es] of [
				...Object.entries(ddlKept),
				...Object.entries(ddlNew),
			])
				ddl[k] = [...(ddl[k] ?? []), ...es];
			return { groups: gs, maps: ms, ddl };
		};
		let dropped = 0;
		const written = await withLock(o.cacheFile, async () => {
			let file = merge(
				readCache(o.cacheFile, o.dialect.name, o.engine),
				contribution(),
				owner,
			);
			for (let round = 0; ; round++) {
				const { text, lines } = renderWithLines(file, o.dialect);
				const v = await this.withProbe(text);
				const errors = (
					await v.program.getSemanticDiagnostics(this.probe)
				).filter((d) => d.category === 1);
				if (!errors.length) break;
				if (round === 3) {
					this.log(
						`validation: still ${errors.length} errors after dropping entries; not writing`,
					);
					return false;
				}
				const failing = new Set<string>();
				for (const d of errors) {
					const line = d.startPosition?.line ?? lineOf(text, d.pos);
					const owner = lines.get(line);
					if (!owner) {
						this.log(
							`validation: an error outside any entry (${d.text}); not writing`,
						);
						return false;
					}
					failing.add(owner);
				}
				dropped += failing.size;
				file = without(file, failing);
			}
			return writeCache(o.cacheFile, file);
		});
		const ms = performance.now() - started;
		const statements = sites.sql.length + sites.types.length + sites.ddl.length;
		this.log(
			`pass: ${statements} statements, ${computed} computed, ${reused} kept, ${dropped} dropped, ${written ? "written" : "unchanged"}, ${ms.toFixed(0)} ms`,
		);
		return { statements, computed, reused, dropped, written, ms };
	}
}

function depsOf(texts: readonly string[], isErr: boolean): string[] {
	const ws = new Set<string>();
	for (const t of texts) {
		const n = scanNames(t);
		for (const x of n.words) ws.add(x);
		for (const x of n.pairs) ws.add(x);
	}
	return [...ws, "*", ...(isErr ? ["!h"] : [])];
}

export async function generate(options: JobOptions): Promise<PassResult> {
	const session = new Session(options);
	try {
		return await session.pass();
	} finally {
		await session.dispose();
	}
}

export class Job {
	private readonly session: Session;
	private watcher: FSWatcher | undefined;
	private timer: NodeJS.Timeout | undefined;
	private idle: NodeJS.Timeout | undefined;
	private running: Promise<unknown> = Promise.resolve();
	private stopped = false;
	private readonly o: JobOptions & {
		readonly debounceMs?: number;
		readonly idleMs?: number;
	};

	constructor(
		o: JobOptions & { readonly debounceMs?: number; readonly idleMs?: number },
	) {
		this.o = o;
		this.session = new Session(o);
	}

	start(): void {
		this.schedule(0);
		const root = dirname(this.o.configFile);
		try {
			this.watcher = watch(root, { recursive: true }, (_event, name) => {
				if (!name) return;
				const file = join(root, name.toString());
				if (
					/[\\/](node_modules|\.git)[\\/]/.test(file) ||
					file === this.o.cacheFile ||
					file.startsWith(`${this.o.cacheFile}.`) ||
					file === this.session.probe
				)
					return;
				if (!/\.(c|m)?tsx?$|\.json$/.test(file)) return;
				this.session.markChanged([file]);
				this.schedule(this.o.debounceMs ?? 500);
			});
		} catch (e) {
			this.o.log?.(
				`watch failed (${(e as Error).message}); the cache updates when the project is reopened`,
			);
		}
	}

	private schedule(delay: number): void {
		if (this.stopped) return;
		clearTimeout(this.timer);
		this.timer = setTimeout(() => {
			this.running = this.running.then(() => this.run());
		}, delay);
	}

	private async run(): Promise<void> {
		if (this.stopped) return;
		clearTimeout(this.idle);
		try {
			await this.session.pass();
		} catch (e) {
			if (this.stopped) return;
			this.o.log?.(`pass failed: ${(e as Error).stack ?? e}`);
			await this.session.close();
		}
		if (!this.stopped)
			this.idle = setTimeout(
				() => void this.session.close(),
				this.o.idleMs ?? 5 * 60_000,
			);
	}

	async stop(): Promise<void> {
		this.stopped = true;
		clearTimeout(this.timer);
		clearTimeout(this.idle);
		this.watcher?.close();
		await this.session.dispose().catch(() => undefined);
	}
}

async function snapshotTypeMap(
	checker: Checker,
	printer: Printer,
	tm: Type,
	specifiers: readonly string[],
): Promise<string | null> {
	const parts: string[] = [];
	for (const p of await checker.getPropertiesOfType(tm)) {
		const t = await checker.getTypeOfSymbol(p);
		const v = await printer.snapshot(t);
		if (v === null) return null;
		parts.push(`${lit(p.name)}: ${coreNames(v, specifiers)}`);
	}
	return `{ ${parts.join("; ")} }`;
}

async function anyLocal(
	printer: Printer,
	bare: readonly string[],
): Promise<boolean> {
	for (const n of bare) if ((await printer.foreign(n)) !== null) return true;
	return false;
}

function stringLiterals(text: string): string[] {
	const out: string[] = [];
	const re = /"((?:[^"\\]|\\.)*)"/g;
	for (let m = re.exec(text); m; m = re.exec(text)) {
		try {
			out.push(JSON.parse(`"${m[1]}"`) as string);
		} catch {}
	}
	return out;
}

const sameTuple = (
	a: readonly string[] | undefined,
	b: readonly string[] | null | undefined,
): boolean =>
	!!a && !!b && a.length === b.length && a.every((x, i) => x === b[i]);

function renderWithLines(
	file: CacheFile,
	dialect: CacheDialect,
): {
	text: string;
	lines: Map<number, string>;
} {
	const text = render(file, "probe", dialect, file.engine);
	const lines = new Map<number, string>();
	const all = text.split("\n");
	let group: string | undefined;
	let inDdl = false;
	all.forEach((l, i) => {
		const g = /^ {4}"probe#(\w+)": \{$/.exec(l);
		if (g) group = g[1];
		if (/^ {4}"probe": \{$/.test(l)) inDdl = true;
		const key = /^ {6}("(?:[^"\\]|\\.)*"):/.exec(l);
		if (key)
			lines.set(
				i,
				inDdl
					? ddlEntryId(JSON.parse(key[1]!) as string)
					: groupEntryId(group ?? "", JSON.parse(key[1]!) as string),
			);
		const snapshot = /^type D_(\w+) = /.exec(l);
		if (snapshot) lines.set(i, `snapshot\0${snapshot[1]}`);
		const map = /^type M_(\w+) = /.exec(l);
		if (map) lines.set(i, `map\0${map[1]}`);
	});
	return { text, lines };
}

function without(file: CacheFile, ids: ReadonlySet<string>): CacheFile {
	const groups: Record<string, Group> = {};
	for (const [g, group] of Object.entries(file.groups)) {
		if (ids.has(`snapshot\0${g}`)) continue;
		const entries: Record<string, Entry> = {};
		for (const [k, e] of Object.entries(group.entries)) {
			if (ids.has(groupEntryId(g, k))) continue;
			const c = e.c?.filter((v) => !ids.has(`map\0${v.m}`));
			if (!e.a && !c?.length) continue;
			entries[k] = { ...e, ...(c ? { c } : {}) };
		}
		groups[g] = { ...group, entries };
	}
	const ddl = Object.fromEntries(
		Object.entries(file.ddl).filter(([k]) => !ids.has(ddlEntryId(k))),
	);
	const owners = Object.fromEntries(
		Object.entries(file.owners).filter(([id]) => !ids.has(id)),
	);
	return { ...file, groups, ddl, owners };
}
