# Type engine

This page explains how TypeSQL's type engine works: the pipeline from SQL text to row types, and the rules it follows to stay within the compiler's limits. It is written for contributors and for readers who want to look under the hood; you don't need it to use TypeSQL.

Everything under `packages/core/src/engine/**` is type-level code that runs in the TypeScript checker. These conventions are the result of measurements on TypeScript 7.0 and 7.1 (`tsc`, the native compiler). Read this before touching the engine.

## Measured limits (TS 7.0.2, unchanged in 7.1.0-beta)

| Limit | Value | Consequence |
|---|---|---|
| Tail-recursive conditional type iterations | 1000 | Any loop over tokens/chars must be chunked or guaranteed short. The lexer restarts every 250 tokens (`LexChunk`). |
| Nesting depth of non-tail alias calls | ≈ 90+ levels verified | Recursive descent is fine. Do not flatten tuples with `[H, ...Rec<R>]`; use accumulators. |
| Instantiations per top-level statement | 5 000 000 | Per *statement* (a `type X = …` declaration), not per file. 500 queries in one file compiled fine. |
| Union size | ~100 000 | Never build `${Digit}${Digit}…` templates; count with a loop (`DigitCount`). |
| Tuple arithmetic (`Tup<N>`) | 1000 | Only for small numbers (param indexes, precedence). Never for string offsets. |

## Pipeline

```
Lex<Q> → Toks            engine/lexer
ParseProgram<Toks> → Stmt engine/parser   (recursive descent + Pratt)
ProjectStmt<Stmt, DB, Outer, Ctes> → Cols | null   engine/project (+ binder, typer)
ParamsOfStmt<Stmt, DB> → ParamMap          engine/typer/params
Analyze<DB, Q> → { kind, cols, params, max, stmt } | SqlError      engine/infer
Analysis<DB, Q> → Analyze without stmt, or a type cache entry      engine/infer, engine/cache
RowOf / ParamsOf / Validate                 public projections of Analysis
```

## Type cache

`engine/cache.ts` holds the type-level side of the [type cache](./performance#type-cache), whose content mapper and job live in `src/cache/`. Three lookups test `keyof QueryCacheKeys` (or `DdlCacheKeys`) first, so a program without a cache pays one conditional each:

- `Analysis<DB, Q>` (what the projections read; `Analyze` itself is never cached),
- the plain `sql()` call (`GateCallCheck`, `BoxCallArgs`, `CallRet` in `create-sql.ts`),
- `ApplyDdl<DB, Q>`, whose cached result is the step's effect applied to `DB`.

An entry is used only when its dependencies compare equal (`Same`): mutual assignability of *expanded* copies, because relating two instantiations of one alias goes by its measured variances, and `Col`'s flags only appear in conditionals. Freshness is decided per group of entries (`GroupStale`, once per program), so a lookup is an indexed access plus a few conditionals. Run `pnpm cache-version` after changing anything under `src/` (except `cache/` and `runtime/`): an entry computed by other sources is never used.

## Result conventions

- **Tokens are accessed by index, never sliced.** A parse function is `P<T extends Toks, I extends number> = Ok<Node, J> | SqlError` where `T` is the whole token tuple, `I` the current index and `J` the index after the node. `Ok<N, J>` is `readonly [N, J]`. `T[I]` is `undefined` past the end. `Nx<I>` (= I + 1) is a lookup in the generated `Next` table (`lexer/next.ts`, regenerate with `node scripts/gen-next.ts`). Propagate with:
  ```ts
  ParseX<T, I> extends infer R ? R extends Ok<infer N, infer J extends number> ? … : R : never
  ```
  Why: matching `readonly [infer H, ...infer R]` builds a new tuple of length n−1 each time (O(n)); a parser doing ~10 such matches per token is O(n²). Measured on 160-column statements: 10.2M instantiations with slicing vs 1.07M index-based.
- Errors are `SqlError<Message, At>`. Parser errors use the token index. Semantic errors (binder/typer/projector) use `null`; `Analyze` locates the identifier named in the message in the token stream.
- Semantic stages return `ColInfo` (`{ type, nullable }`), `Cols`, `ColMap`, or `SqlError`. Test with `X extends ColInfo ? … : X` to propagate.

## Pitfalls (each one cost real debugging time)

1. **`never` in `extends [infer A, infer B]` takes the TRUE branch** and binds `A`/`B` to their constraints. Helpers that can fail must return `null` (or an `SqlError`), never `never`. `Ident`, `QualName`, `FuncName`, `ParseJoinKind` return `null`. `EatWord`/`EatOp` return `never` but are only ever tested with `extends never`.
2. **A union-constrained `infer` in a template literal matches ONE character.** `` S extends `${infer O extends "::" | "->"}${infer R}` `` never matches `::`. Build candidates explicitly (see `LexOp` in the lexer).
3. **A union in a template-literal delimiter position yields a union of all splits**, not the shortest. Scan words char by char with `${infer C}${infer R}` + `C extends IdChar`.
4. **Conditional type narrowing does not satisfy structural constraints.** In `B extends { t: "simple" } ? F<B>`, `B` is `B & { t: "simple" }`, which TS will not accept where `SimpleSelect` is required. Use `F<Extract<B, SimpleSelect>>`.
5. **Deferred alias references inside tuples/objects are not evaluated.** `[Rec<R>]` looks cheap but hides unbounded recursion until something forces it. Prefer accumulators (`Rec<R, [...Acc, X]>`), which are also tail calls.
6. **Keep AST nodes free of optional properties.** Use `null` for absence; with `exactOptionalPropertyTypes` optional props make pattern matching brittle.
7. **Lexer dispatch order matters for cost.** Infer the first char once, then branch on its class (whitespace, identifier start, digit, quote, `$`, operator).
8. **Parameters are typed in a separate pass** (`ParamsOfExpr`) that looks at the sibling of a `$n` node. The main typer treats `$n` as `unknown` so the other side wins.
9. **Never pass a recursive conditional result into a constrained type parameter.** `F<ParamsOfExpr<…>>` with `F<M extends ParamMap>` forces TS to compute the constraint of the whole mutually recursive alias graph at declaration time ("excessively deep", or minutes of compile time). Accumulator parameters are unconstrained; use `infer X extends …` to check shapes instead.
10. **Nested `Nx<Nx<I>>` is fine only because `Next` has a numeric index signature.** A conditional (`I extends keyof Next ? …`) in that position made every nested use a 4096-member union comparison at declaration time.
12. **AST constraint types must be shallow.** Comparing a concrete AST subtree against a recursive union (`infer L extends Expr` with `Expr` = the precise node union) walks the whole subtree; a left-nested `a OR b OR …` of ~50 terms hit "Excessive stack depth comparing types". Generic-interface nodes do not help in TS 7. `Expr` is therefore `{ readonly t: ExprTag; readonly [field: string]: any }` (the precise union is `ExprNode`): checks look at one level, and `E["l"]` on a narrowed node is `any`, which satisfies any constraint. 200-term `OR` chains now type-check. Keep other recursive AST types (`FromItem`, `SelectBody`) shallow in practice: joins and set operations rarely nest deeply.
14. **Evolved types must not reference their previous versions.** `ApplyDdl` first built each new schema as `Omit<Prev, K> & { … }`, so a schema after N statements held a chain of N earlier schemas, and every conditional that inspected it walked the chain ("excessively deep" after ~45 statements, also breaking queries against that schema). `ddl/apply.ts` rebuilds every stored table and namespace from single-key pieces (`Build`), so each version stands alone.
15. **Don't round-trip an index cursor through a tuple.** Storing `I` in a tuple and reading it back with `infer I extends number` keeps the unevaluated `Nx<Nx<…>>` chain and hits the instantiation-depth limit. Pass indexes as direct type arguments.
16. **Tail-recursive walks that push AST subtrees onto a tuple stack are quadratic.** Plain recursion over indexed access, iterating only along the left spine, is linear.
17. **The parser balances `AND`/`OR` chains.** `a OR b OR c …` becomes a balanced tree (depth log n), so a 200-term chain costs ~60K instantiations instead of 3.4M. Other left-associative operators (`||`, `+`) are not balanced (types may depend on order); chains of ~100 such terms are the practical limit.
13. **Error carrier properties must not shadow `String.prototype` members.** The call site types the query as `SqlError<…> & Q`; a property named `at` (or `length`, `slice`, …) conflicts with the string's apparent type and TypeScript reduces the intersection to `never`, which hides the message. `SqlError` uses `position`.
11. **Build object types with intersections, flatten once.** `ColsToMap` accumulates `Acc & { [K in N]: T }` and maps over `keyof Acc` at the end; chaining mapped types (`MergeMap<MergeMap<…>>`) made every member lookup resolve the whole chain.

## Adding grammar

- New expression syntax: add an AST node in `ast.ts`, parse it in `parser/expr.ts` (prefix or infix), type it in `typer/typeof.ts`, name it in `project/naming.ts`, and handle params in `typer/params.ts`. Add SQL and schema inputs to `packages/core/test/oracle/corpus.json` so PostgreSQL determines the expected behavior.
- New function: add a `Sig` to `FunctionCatalog` in `typer/catalog.ts`, then regenerate `typer/pg-functions.ts` (the uncurated pg_catalog rest) with `TYPESQL_PG_URL=… node scripts/gen-pg-functions.ts`.
- New statement: add to `ast.ts`, parse in `parser/<kind>.ts`, dispatch in `parser/stmt.ts`, project in `project/stmt.ts`.

## Checking behavior

Correctness checks compare TypeSQL with PostgreSQL. The repository has no hand-written unit/integration suites, static type assertion suites, or coverage gates.

- Run `pnpm pg-regress:setup` once to check out the pinned PostgreSQL regression corpus. Never edit `vendor/postgres`.
- `pnpm test` builds the packages, exercises their emitted JavaScript, and runs all PostgreSQL differential checks and fuzzing. The live checks need Docker or `TYPESQL_ORACLE_URL` pointing to PostgreSQL 18. Regression replay needs the corpus data mounted at `/regress` on that server; Docker startup handles this automatically.
- `pnpm test:pg-regress` compares parser acceptance with PostgreSQL's recorded regression outcomes. `pnpm test:pg-ast` compares parse trees with PostgreSQL's parser over the official regression corpus and the standalone query corpus.
- `pnpm test:oracle --regress --views` compares inferred columns, parameter types, nullability and DDL behavior with a live server, using the query corpus, function catalog and official regression replay. `pnpm fuzz` generates additional statements and checks their behavior against that server.
- Add query inputs in `packages/core/test/oracle/corpus.json`. `schemas` maps stable IDs to TypeScript DB types using the probe's `__T` import. Each `statements` entry has a `schema` ID, `source` label, `sql` text with positional parameters, and a `ddl` flag. A null schema limits an entry to parser comparison. The original source labels remain stable for baseline identity; they do not refer to files that must exist. For duplicate SQL over the same schema, the first entry owns the type-oracle source label, so preserve its position. `catalog.d.ts` supplies custom function declarations used by the corpus. Inputs contain no expected TypeSQL results. Include nullable and non-nullable inputs when changing nullability rules.
- Baselines record reviewed disagreements. New disagreements are regressions to fix; update baselines only after reviewing findings that went away or an intentional PostgreSQL version change.
- Quick iteration: `./node_modules/.bin/tsc --noEmit --strict --target es2024 --moduleResolution bundler --module esnext --skipLibCheck <file>` on a scratch file under `scratchpad/`. Add `--extendedDiagnostics` to see instantiation counts.
