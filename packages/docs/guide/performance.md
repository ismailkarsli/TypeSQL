<script setup>
import bench from "../.vitepress/benchmarks.json";
</script>

# Performance and type cache

TypeSQL parses your SQL in the type checker, so its cost is paid at compile time, in your editor and in `tsc`. At runtime nothing is parsed: `sql(…)` builds `{ text, values }` and the driver runs it.

## Compile time

The [real-world application fixture](https://github.com/ismailkarsli/TypeSQL/blob/main/packages/bench/src/case1.ts) contains 379 statements, their schema, and reusable SQL fragments. Every benchmark uses this fixture unchanged.

<div v-if="bench">

Average checking cost per statement is {{ bench.instantiationsPerQuery }} type instantiations, or {{ bench.throughput.tsc.checkMsPerQuery }} ms with `tsc` and {{ bench.throughput.tsrs.checkMsPerQuery }} ms with [tsrs](https://github.com/oxc-project/tsrs). These are whole-application averages, including schema and fragment checking.

Measurements were taken on {{ bench.date }} with `tsc` {{ bench.compilers.tsc }} and tsrs {{ bench.compilers.tsrs }} on {{ bench.environment.cpus }} logical CPUs ({{ bench.environment.cpu }}). Instantiation counts below are from tsrs; both compilers report no errors:

| Application workload | Instantiations | Check time, `tsc` | Check time, tsrs |
|---|---|---|---|
| `case1` (built package) | {{ bench.rows.case1.instantiations }} | {{ bench.rows.case1.tsc }} s | {{ bench.rows.case1.tsrs }} s |
| [`case1 cached`](#type-cache) | {{ bench.rows["case1 cached"].instantiations }} | {{ bench.rows["case1 cached"].tsc }} s | {{ bench.rows["case1 cached"].tsrs }} s |
| `case1 stale` | {{ bench.rows["case1 stale"].instantiations }} | {{ bench.rows["case1 stale"].tsc }} s | {{ bench.rows["case1 stale"].tsrs }} s |
| `case1 source` | {{ bench.rows["case1 source"].instantiations }} | {{ bench.rows["case1 source"].tsc }} s | {{ bench.rows["case1 source"].tsrs }} s |

TypeScript keeps a result only for the life of one program, so the editor computes it again after every edit, and `tsc` on every run. The [type cache](#type-cache) keeps the results in a file instead. A warm cache uses {{ bench.cache.cachedRatio }}× the instantiations of the uncached application; a stale cache uses {{ bench.cache.staleRatio }}×.

</div>

<p v-else>GitHub Actions measurements for this workload will appear after the next release.</p>

CI measures with both compilers and fails a change that exceeds the instantiation, check-time, error or cache-ratio budgets in `packages/bench/thresholds.json`.

## Runtime

<div v-if="bench">

On Node {{ bench.environment.node }}, building the same {{ bench.workload.statements }} statements costs **{{ bench.runtime.microsecondsPerQuery }} µs per statement** on average, or **{{ bench.runtime.millisecondsPerWorkload }} ms for the application workload**.

</div>

<p v-else>GitHub Actions runtime measurements will appear after the next release.</p>

The runner supplies deterministic populated runtime inputs and reuses the fixture's setup fragments; setup is outside the timed loop. SQL text and statement expressions come directly from the fixture.

`@typesql/core` has no dependencies and is 10 KB minified, 4.0 KB gzipped.

### Reproduce the numbers

From a clone of the repository:

```sh
pnpm --filter @typesql/core build
pnpm bench
```

To refresh the published numbers, run the **benchmark** workflow on `main` in GitHub Actions,
or use `gh workflow run benchmark.yml --ref main`. Every release from 0.7.1 and the current
sources run sequentially in one job, using the same fixture, installed compilers and checking
options. Check times are medians of three runs per variant. Version 0.7.1 is the first release
containing this fixture; older versions are excluded. Current sources must pass the existing
thresholds; older releases must compile successfully but are allowed to exceed today's budgets.

The workflow commits updated README, docs and complete history numbers, then deploys the docs.
The `bench-results` artifact includes every release's revision, raw samples, compiler versions
and runner details. If `main` moves during the run, start it again. Release workflows also
remeasure the complete history so each published chart compares versions on the same runner.
To run this comparison locally, use `node packages/bench/history.ts` with full release tags fetched.

## Type cache

The type cache is an optional file in your project that holds results the checker would otherwise compute again. It needs TypeScript 7.1, whose content mappers let `@typesql/core` serve the file to the checker: no CLI, no editor extension, no code in your app.

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

A background job fills the file once the editor has the project open. It works for PostgreSQL and [SQLite](./sqlite) statements: for a new file it picks the dialect from the statements it finds, and records it in the file. You can commit the file to share a warm cache, or ignore it in git.

### How it works

While the project is open in the editor, a job opens its own TypeScript session on it, finds the statements (`sql()` calls, `migrations().add()` steps, and statement types such as `RowOf<DB, TypeMap, "SELECT …">`), computes their results and writes the file. After an edit it computes only what the edit affects, and it stops after five idle minutes. `tsc` reads the file but runs no job, and no job runs when `CI` is set or with `TYPESQL_CACHE=off`.

Each entry records what it was computed from: the TypeSQL version, everything the statement could name in `DB` (relations, functions, enums; for SQLite, every relation whose name matches regardless of case), and the type map and `rowKeys` option. When any of it differs, the statement is analysed as usual and the job replaces the entry. So the cache never changes a type or an error; a stale, empty or damaged file only means slower checks.

A few statements are never cached: those whose types name one of your types the cache file can't import (an unexported interface inside `Json<T>`), those with a misspelled function name, and non-literal statement texts.

### Several projects and cache files

- A cache file serves the program it is part of. If several `tsconfig` files include the same cache file (an app and its tests), each project's job adds its entries. An entry stays as long as some project uses it.
- In a monorepo, give each package its own cache file. With project references, a referenced package arrives as `.d.ts` files whose query types are already resolved.
- If one program includes several cache files, all of them are served, and the job writes the first one by path.

### Opting out

Remove the `contentMappers` entry, or set `"contentMappers": null` in a `tsconfig` that extends the main one. Do this for CI steps and tools that can't pass `--runExternalCode`. A leftover cache file is then ignored.

### TypeScript's own caching

`incremental` builds skip unchanged files between `tsc` runs. Project references let a package's queries be checked once and used as `.d.ts`. Both work with or without the type cache.

### Troubleshooting

- Set `TYPESQL_CACHE_LOG=/path/to/file` in the editor's environment to log what the mapper and the job do.
- The job evaluates entries in a file it adds in memory next to the cache file. So the project must include `.ts` files from that directory (`"include": ["src"]` does). If it doesn't, the log says so and the file stays as it is.
- While the job runs, it is a second TypeScript instance holding the project in memory.
- Content mappers are new in TypeScript 7.1 and may still change before 7.1 is final.
