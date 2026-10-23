/// <reference types="node" />
/**
 * Reading, merging and writing a cache file. Several projects (tsconfigs) can share one file:
 * each owns the entries it uses (`CacheFile.owners`), a pass replaces only its own, and an entry
 * goes when no project uses it any more. Writes go to a temporary file renamed over the cache
 * file, under a lock file next to it, so a reader never sees a partial file and two editors on
 * one project take turns.
 */
import { closeSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { emptyCache, parseCache, stringifyCache, type CacheFile, type DdlEntry, type Entry, type Group } from "./format.js";

/** What one pass computed for one project. */
export interface Contribution {
  readonly groups: { readonly [group: string]: Group };
  readonly maps: { readonly [map: string]: string };
  readonly ddl: { readonly [key: string]: readonly DdlEntry[] };
}

export const groupEntryId = (group: string, key: string): string => `${group}\0${key}`;
export const ddlEntryId = (key: string): string => `ddl\0${key}`;

export function readCache(path: string, engine: string): CacheFile {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return emptyCache(engine);
  }
  const file = parseCache(text);
  return file && file.engine === engine ? file : emptyCache(engine);
}

/**
 * `file` with `owner`'s entries replaced by `mine`. Entries of other owners stay, with the
 * word and pair snapshots they depend on (a snapshot `mine` recomputed replaces the old one:
 * an entry of another project that depended on the old one is stale until its job runs).
 */
export function merge(file: CacheFile, mine: Contribution, owner: string): CacheFile {
  const owners: Record<string, string[]> = {};
  for (const [id, os] of Object.entries(file.owners)) {
    const rest = os.filter((o) => o !== owner);
    if (rest.length) owners[id] = rest;
  }
  const own = (id: string): void => {
    (owners[id] ??= []).push(owner);
    owners[id].sort();
  };
  const groups: Record<string, { t: string; h: string; w: Record<string, readonly [string, string, string, string]>; q: Record<string, string>; entries: Record<string, Entry> }> = {};
  for (const [g, group] of Object.entries(file.groups)) {
    const entries = Object.fromEntries(Object.entries(group.entries).filter(([key]) => owners[groupEntryId(g, key)]));
    groups[g] = { t: group.t, h: group.h, w: { ...group.w }, q: { ...group.q }, entries };
  }
  for (const [g, group] of Object.entries(mine.groups)) {
    const target = (groups[g] ??= { t: group.t, h: group.h, w: {}, q: {}, entries: {} });
    target.t = group.t;
    target.h = group.h;
    Object.assign(target.w, group.w);
    Object.assign(target.q, group.q);
    for (const [key, entry] of Object.entries(group.entries)) {
      // keep the call variants (type maps, rowKeys) other projects computed for this key
      const theirs = (target.entries[key]?.c ?? []).filter((c) => !entry.c?.some((m) => m.m === c.m && m.k === c.k));
      const c = [...(entry.c ?? []), ...theirs];
      target.entries[key] = { ...entry, ...(c.length ? { c } : {}) };
      own(groupEntryId(g, key));
    }
  }
  // drop snapshots no entry depends on any more, and empty groups
  for (const [g, group] of Object.entries(groups)) {
    const used = new Set(Object.values(group.entries).flatMap((e) => e.r));
    if (!used.size) {
      delete groups[g];
      continue;
    }
    group.w = Object.fromEntries(Object.entries(group.w).filter(([w]) => used.has(w)));
    group.q = Object.fromEntries(Object.entries(group.q).filter(([p]) => used.has(p)));
  }
  const ddl: Record<string, DdlEntry[]> = {};
  for (const [key, es] of Object.entries(file.ddl)) if (owners[ddlEntryId(key)]) ddl[key] = [...es];
  for (const [key, es] of Object.entries(mine.ddl)) {
    const list = (ddl[key] ??= []);
    for (const e of es) if (!list.some((x) => JSON.stringify(x) === JSON.stringify(e))) list.push(e);
    own(ddlEntryId(key));
  }
  const maps: Record<string, string> = {};
  const usedMaps = new Set(Object.values(groups).flatMap((g) => Object.values(g.entries).flatMap((e) => (e.c ?? []).map((c) => c.m))));
  for (const [m, text] of [...Object.entries(file.maps), ...Object.entries(mine.maps)]) if (usedMaps.has(m)) maps[m] = text;
  return { typesqlcache: file.typesqlcache, engine: file.engine, groups, maps, ddl, owners };
}

/** Run `fn` holding `<path>.lock`; a lock older than `staleMs` is taken over (its holder died). */
export async function withLock<T>(path: string, fn: () => Promise<T>, staleMs = 60_000): Promise<T> {
  const lock = `${path}.lock`;
  for (let attempt = 0; ; attempt++) {
    try {
      closeSync(openSync(lock, "wx"));
      break;
    } catch {
      try {
        if (Date.now() - statSync(lock).mtimeMs > staleMs) unlinkSync(lock);
      } catch {
        // gone in the meantime
      }
      if (attempt > 600) throw new Error(`typesql: could not lock ${path}`);
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  try {
    return await fn();
  } finally {
    try {
      unlinkSync(lock);
    } catch {
      // already gone
    }
  }
}

/** Write `file` to `path` through a temporary file; returns false when the content is unchanged. */
export function writeCache(path: string, file: CacheFile): boolean {
  const text = stringifyCache(file);
  try {
    if (readFileSync(path, "utf8") === text) return false;
  } catch {
    // new file
  }
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, path);
  return true;
}
