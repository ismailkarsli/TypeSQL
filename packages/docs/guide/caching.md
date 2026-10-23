# Type cache

TypeSQL parses each statement inside the TypeScript checker. A typical query costs about 9K
type instantiations, a few milliseconds of check time. TypeScript remembers results within one
program, but every new program starts over: every `tsc` run, and in the editor every edit.
With many queries that adds up.

The type cache is optional. A file in your project holds results the checker would otherwise
compute, and a background job keeps it up to date. It needs TypeScript 7.1, whose content
mappers let `@typesql/core` serve the file to the checker. Nothing else is involved: no CLI, no
editor extension, no code in your app.

In the [bench](https://github.com/ismailkarsli/typesql/tree/main/packages/bench), 500 queries
compiled against the built package take 2.6 s of check time and 4.6M instantiations without a
cache, and 0.13 s and 123K with one: a cached query costs about 230 instantiations instead of 9K.

## Setup

1. Add the content mapper to `tsconfig.json`:

   ```jsonc
   {
     "contentMappers": [{ "package": "@typesql/core", "extensions": [".typesqlcache"] }],
     "include": ["src"]
   }
   ```

2. Create the cache file, containing `{}`, in a directory the project includes, for example
   `src/generated/queries.typesqlcache`. One file covers the whole project, wherever it is.
   It needs a base name: a bare `.typesqlcache` is a dotfile, and `include` globs skip
   dotfiles.

3. Allow external code. In VS Code, trust the workspace and allow the content mapper when
   asked. Other editors must send `initializationOptions.runExternalCode: true` to the
   TypeScript language server. `tsc` needs `--runExternalCode` on the command line (it
   cannot be set in `tsconfig.json`); without it, `tsc` stops with TS18068.

The job fills the file once the editor has the project open. You can commit the file to share
a warm cache, or ignore it in git: an entry that no longer fits the project is never used,
whichever way it got there.

## How it works

- **Serving.** TypeScript hands the file to `@typesql/core`, which turns it into type
  declarations the checker reads. A statement with a usable entry gets its row type,
  parameter types and errors from there; any other statement is analysed as usual.
- **Generating.** While the project is open in the editor, a job in the same process opens
  its own TypeScript session on the project. It finds the statements (`sql()` calls,
  `migrations().add()` steps, and statements written as types, like
  `RowOf<DB, TypeMap, "SELECT …">`), computes their results, and writes the file. It then
  watches the sources: after an edit it computes only what the edit affects. The session
  closes after five idle minutes.
- **Under `tsc`.** The file is served, but `tsc` exits as soon as it has checked the
  project, so no job runs (it starts a moment after the project opens, and is abandoned when
  `tsc` closes the project). No job runs when `CI` is set, or with `TYPESQL_CACHE=off`.

## When an entry is used

Each entry records what it was computed from, and the checker compares that with the current
program every time it looks the entry up:

- the TypeSQL version that computed it;
- every relation, schema function and catalog function its statement could name: every word
  of the statement is recorded, with what `DB` had under that name (or that it had nothing),
  so a new table with the name of an alias or a CTE makes the entry stale too;
- the enum types (`$types`);
- for an error, the table and column names a "Perhaps you meant" hint chooses from;
- for a `sql()` call, the type map and the `rowKeys` option.

An entry that differs in any of these is not used: the statement is analysed again, as
without a cache, and the job replaces the entry. So the cache can make checking faster but
never changes a type or an error. An empty, missing, damaged or old file only means slower.

Some statements get no entry and are always analysed: a statement whose types name one of
your types that the cache file cannot import (an unexported interface inside `Json<T>`), a
misspelled function name, and statement texts that are not literals.

## Several projects and cache files

- A cache file serves the program it is part of. If several `tsconfig` files include the
  same cache file (an app and its tests), each project's job adds its entries, and an entry
  stays as long as some project uses it.
- In a monorepo, give each package its own cache file. With project references, a
  referenced package arrives as `.d.ts` files whose query types are already resolved.
- If one program includes several cache files, all of them are served and the job writes
  the first by path.

## Opting out

Remove the `contentMappers` entry, or set `"contentMappers": null`, for example in a
`tsconfig` that extends the main one, for CI steps and tools that cannot pass
`--runExternalCode` (such as `vitest --typecheck`). That program checks every statement, as it
would without a cache; a leftover cache file is ignored.

## TypeScript's own caching

`incremental` builds skip unchanged files between `tsc` runs, and project references let a
package's queries be checked once and consumed as `.d.ts`. Both work with or without the type
cache.

## Troubleshooting

- Set `TYPESQL_CACHE_LOG=/path/to/file` in the editor's environment to log what the mapper
  and the job do.
- The job evaluates entries in a file it adds in memory next to the cache file, so the project
  must include `.ts` files from that directory (`"include": ["src"]` does). If it does not, the
  log says so and the file stays as it is.
- The job is a second TypeScript instance holding the project, while it runs.
- Content mappers are new in TypeScript 7.1 and may still change before 7.1 is final.
