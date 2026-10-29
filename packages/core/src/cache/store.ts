import {
	closeSync,
	openSync,
	readFileSync,
	renameSync,
	statSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import {
	type CacheFile,
	type DdlEntry,
	type Entry,
	emptyCache,
	type Group,
	parseCache,
	stringifyCache,
} from "./format.js";

export interface Contribution {
	readonly groups: { readonly [group: string]: Group };
	readonly maps: { readonly [map: string]: string };
	readonly ddl: { readonly [key: string]: readonly DdlEntry[] };
}

export const groupEntryId = (group: string, key: string): string =>
	`${group}\0${key}`;
export const ddlEntryId = (key: string): string => `ddl\0${key}`;

export function readCache(
	path: string,
	dialect: string,
	engine: string,
): CacheFile {
	let text: string;
	try {
		text = readFileSync(path, "utf8");
	} catch {
		return emptyCache(dialect, engine);
	}
	const file = parseCache(text);
	return file && file.dialect === dialect && file.engine === engine
		? file
		: emptyCache(dialect, engine);
}

export function merge(
	file: CacheFile,
	mine: Contribution,
	owner: string,
): CacheFile {
	const owners: Record<string, string[]> = {};
	for (const [id, os] of Object.entries(file.owners)) {
		const rest = os.filter((o) => o !== owner);
		if (rest.length) owners[id] = rest;
	}
	const own = (id: string): void => {
		owners[id] ??= [];
		owners[id].push(owner);
		owners[id].sort();
	};
	const groups: Record<
		string,
		{
			t: string;
			h: string;
			w: Record<string, readonly [string, string, string, string]>;
			q: Record<string, string>;
			entries: Record<string, Entry>;
		}
	> = {};
	for (const [g, group] of Object.entries(file.groups)) {
		const entries = Object.fromEntries(
			Object.entries(group.entries).filter(
				([key]) => owners[groupEntryId(g, key)],
			),
		);
		groups[g] = {
			t: group.t,
			h: group.h,
			w: { ...group.w },
			q: { ...group.q },
			entries,
		};
	}
	for (const [g, group] of Object.entries(mine.groups)) {
		groups[g] ??= {
			t: group.t,
			h: group.h,
			w: {},
			q: {},
			entries: {},
		};
		const target = groups[g];
		if (
			target.t !== group.t ||
			target.h !== group.h ||
			(["w", "q"] as const).some((k) =>
				Object.entries(group[k]).some(
					([key, value]) =>
						Object.hasOwn(target[k], key) &&
						JSON.stringify(target[k][key]) !== JSON.stringify(value),
				),
			)
		) {
			for (const key of Object.keys(target.entries))
				delete owners[groupEntryId(g, key)];
			target.entries = {};
			target.w = {};
			target.q = {};
		}
		target.t = group.t;
		target.h = group.h;
		Object.assign(target.w, group.w);
		Object.assign(target.q, group.q);
		for (const [key, entry] of Object.entries(group.entries)) {
			const theirs = (target.entries[key]?.c ?? []).filter(
				(c) => !entry.c?.some((m) => m.m === c.m && m.k === c.k),
			);
			const c = [...(entry.c ?? []), ...theirs];
			target.entries[key] = { ...entry, ...(c.length ? { c } : {}) };
			own(groupEntryId(g, key));
		}
	}
	for (const [g, group] of Object.entries(groups)) {
		const used = new Set(Object.values(group.entries).flatMap((e) => e.r));
		if (!used.size) {
			delete groups[g];
			continue;
		}
		group.w = Object.fromEntries(
			Object.entries(group.w).filter(([w]) => used.has(w)),
		);
		group.q = Object.fromEntries(
			Object.entries(group.q).filter(([p]) => used.has(p)),
		);
	}
	const ddl: Record<string, DdlEntry[]> = {};
	for (const [key, es] of Object.entries(file.ddl))
		if (owners[ddlEntryId(key)]) ddl[key] = [...es];
	for (const [key, es] of Object.entries(mine.ddl)) {
		ddl[key] ??= [];
		const list = ddl[key];
		for (const e of es)
			if (!list.some((x) => JSON.stringify(x) === JSON.stringify(e)))
				list.push(e);
		own(ddlEntryId(key));
	}
	const maps: Record<string, string> = {};
	const usedMaps = new Set(
		Object.values(groups).flatMap((g) =>
			Object.values(g.entries).flatMap((e) => (e.c ?? []).map((c) => c.m)),
		),
	);
	for (const [m, text] of [
		...Object.entries(file.maps),
		...Object.entries(mine.maps),
	])
		if (usedMaps.has(m)) maps[m] = text;
	return {
		typesqlcache: file.typesqlcache,
		dialect: file.dialect,
		engine: file.engine,
		groups,
		maps,
		ddl,
		owners,
	};
}

export async function withLock<T>(
	path: string,
	fn: () => Promise<T>,
	staleMs = 60_000,
): Promise<T> {
	const lock = `${path}.lock`;
	for (let attempt = 0; ; attempt++) {
		try {
			closeSync(openSync(lock, "wx"));
			break;
		} catch {
			try {
				if (Date.now() - statSync(lock).mtimeMs > staleMs) unlinkSync(lock);
			} catch {}
			if (attempt > 600) throw new Error(`typesql: could not lock ${path}`);
			await new Promise((r) => setTimeout(r, 100));
		}
	}
	try {
		return await fn();
	} finally {
		try {
			unlinkSync(lock);
		} catch {}
	}
}

export function writeCache(path: string, file: CacheFile): boolean {
	const text = stringifyCache(file);
	try {
		if (readFileSync(path, "utf8") === text) return false;
	} catch {}
	const tmp = `${path}.${process.pid}.tmp`;
	writeFileSync(tmp, text);
	renameSync(tmp, path);
	return true;
}
