# Performance and type cache

TypeSQL parses your SQL in the type checker, so its cost is paid at compile time, in your editor and in `tsc`. At runtime nothing is parsed: `sql(…)` builds `{ text, values }` and the driver runs it.

## Compile time

Each query costs about 9.2K type instantiations, or about 5 ms of check time with `tsc` (about 190 queries per second) and about 2.2 ms with [tsrs](https://github.com/oxc-project/tsrs), a Rust port of TypeScript 7 (about 450 queries per second).

The [bench](https://github.com/ismailkarsli/TypeSQL/tree/main/packages/bench) type-checks files of distinct, realistic queries (joins, aggregates, parameters) against the built package, as an application is compiled. It runs with `tsc` from TypeScript 7.1.0-beta and with tsrs 0.18.0 (which follows a TypeScript 7.1 dev build) on a 4-core Xeon Platinum 8488C. Both report the same instantiations and errors:

| File | Instantiations | Check time, `tsc` | Check time, tsrs | With the [type cache](#type-cache), `tsc` / tsrs |
|---|---|---|---|---|
| 1 query | 18K | 0.04 s | 0.02 s | |
| 50 queries | 517K | 0.31 s | 0.14 s | 20K, 0.02 s / 0.006 s |
| 500 queries | 4.6M | 2.6 s | 1.1 s | 123K, 0.13 s / 0.02 s |

TypeScript keeps a result only for the life of one program, so the editor computes it again after every edit, and `tsc` on every run. The [type cache](#type-cache) keeps the results in a file instead.

The bench also checks the other call forms and long statements against TypeSQL's own sources, which `skipLibCheck` does not skip:

| File | Instantiations | Check time, `tsc` | Check time, tsrs |
|---|---|---|---|
| 1 query (mostly checking TypeSQL's sources) | 149K | 0.22 s | 0.08 s |
| 500 queries | 4.7M | 2.8 s | 1.2 s |
| 50 queries with `:name` and inline parameters and a shared fragment | 422K | 0.43 s | 0.14 s |
| one statement each of 0.5, 1, 2, 4 and 8 KB | 6.6M | 0.95 s | 0.31 s |

CI measures with `tsc` and fails a change that takes a bench file over its instantiation or check-time budget, or a cache hit over 250 instantiations (`packages/bench/thresholds.json`).

## Runtime

Building a query (Node 26, same machine):

| Call | Time |
|---|---|
| `sql("… WHERE id = $1", 7)` | 1.1 µs |
| `:name` parameters | 1.3 µs |
| inline `${sql.param(…)}` values | 4.0 µs |
| a `{slot}` fragment | 1.6 µs |

`@typesql/core` has no dependencies and is 10 KB minified, 4.0 KB gzipped.

### Reproduce the numbers

From a clone of the repository:

```sh
node packages/bench/gen.ts && pnpm --filter @typesql/core build && node packages/bench/run.ts   # compile time
node packages/bench/run.ts --compiler tsrs                                                      # compile time with tsrs
pnpm build && node packages/bench/runtime.ts                                                    # runtime
```

## Type cache

The type cache is an optional file in your project that holds results the checker would otherwise compute again. A cached query costs about 230 instantiations instead of about 9K. It needs TypeScript 7.1, whose content mappers let `@typesql/core` serve the file to the checker: no CLI, no editor extension, no code in your app.

### Setup

1. Add the content mapper to `tsconfig.json`:

   ```jsonc
   {
     "contentMappers": [{ "package": "@typesql/core", "extensions": [".typesqlcache"] }],
     "include": ["src"]
   }
   ```

2. Create the cache file with the content `{}`, in a directory the project includes, for example `src/generated/queries.typesqlcache`. One file covers the whole project, wherever it is. Give it a base name: a bare `.typesqlcache` is a dotfile, and `include` globs skip dotfiles.

3. Allow external code:
   - In VS Code, trust the workspace and allow the content mapper when asked.
   - Other editors must send `initializationOptions.runExternalCode: true` to the TypeScript language server.
   - `tsc` needs `--runExternalCode` on the command line (it can't be set in `tsconfig.json`). Without it, `tsc` stops with TS18068.

A background job fills the file once the editor has the project open. You can commit the file to share a warm cache, or ignore it in git.

### How it works

While the project is open in the editor, a job opens its own TypeScript session on it, finds the statements (`sql()` calls, `migrations().add()` steps, and statement types such as `RowOf<DB, TypeMap, "SELECT …">`), computes their results and writes the file. After an edit it computes only what the edit affects, and it stops after five idle minutes. `tsc` reads the file but runs no job, and no job runs when `CI` is set or with `TYPESQL_CACHE=off`.

Each entry records what it was computed from: the TypeSQL version, everything the statement could name in `DB` (relations, functions, enums), and the type map and `rowKeys` option. When any of it differs, the statement is analysed as usual and the job replaces the entry. So the cache never changes a type or an error; a stale, empty or damaged file only means slower checks.

A few statements are never cached: those whose types name one of your types the cache file can't import (an unexported interface inside `Json<T>`), those with a misspelled function name, and non-literal statement texts.

### Several projects and cache files

- A cache file serves the program it is part of. If several `tsconfig` files include the same cache file (an app and its tests), each project's job adds its entries. An entry stays as long as some project uses it.
- In a monorepo, give each package its own cache file. With project references, a referenced package arrives as `.d.ts` files whose query types are already resolved.
- If one program includes several cache files, all of them are served, and the job writes the first one by path.

### Opting out

Remove the `contentMappers` entry, or set `"contentMappers": null` in a `tsconfig` that extends the main one. Do this for CI steps and tools that can't pass `--runExternalCode` (such as `vitest --typecheck`). A leftover cache file is then ignored.

### TypeScript's own caching

`incremental` builds skip unchanged files between `tsc` runs. Project references let a package's queries be checked once and used as `.d.ts`. Both work with or without the type cache.

### Troubleshooting

- Set `TYPESQL_CACHE_LOG=/path/to/file` in the editor's environment to log what the mapper and the job do.
- The job evaluates entries in a file it adds in memory next to the cache file. So the project must include `.ts` files from that directory (`"include": ["src"]` does). If it doesn't, the log says so and the file stays as it is.
- While the job runs, it is a second TypeScript instance holding the project in memory.
- Content mappers are new in TypeScript 7.1 and may still change before 7.1 is final.
