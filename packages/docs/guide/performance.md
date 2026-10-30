<script setup>
import bench from "../.vitepress/benchmarks.json";
</script>

# Performance

TypeSQL parses your SQL in the type checker, so its cost is paid at compile time, in your editor and in `tsc`. At runtime nothing is parsed: `sql(…)` builds `{ text, values }` and the driver runs it.

## Compile time

The [real-world application fixture](https://github.com/ismailkarsli/TypeSQL/blob/main/packages/bench/src/case1.ts) contains 379 statements, their schema, and reusable SQL fragments. Every benchmark uses this fixture unchanged.

<div v-if="bench">

Average checking cost per statement is {{ bench.instantiationsPerQuery }} type instantiations, or {{ bench.throughput.tsc.checkMsPerQuery }} ms with `tsc` and {{ bench.throughput.tsrs.checkMsPerQuery }} ms with [tsrs](https://github.com/oxc-project/tsrs). These are whole-application averages, including schema and fragment checking.

Measurements were taken on {{ bench.date }} with `tsc` {{ bench.compilers.tsc }} and tsrs {{ bench.compilers.tsrs }} on {{ bench.environment.cpus }} logical CPUs ({{ bench.environment.cpu }}). Instantiation counts below are from tsrs; both compilers report no errors:

| Application workload | Instantiations | Check time, `tsc` | Check time, tsrs |
|---|---|---|---|
| `case1` (built package) | {{ bench.rows.case1.instantiations }} | {{ bench.rows.case1.tsc }} s | {{ bench.rows.case1.tsrs }} s |
| `case1 source` | {{ bench.rows["case1 source"].instantiations }} | {{ bench.rows["case1 source"].tsc }} s | {{ bench.rows["case1 source"].tsrs }} s |


</div>

<p v-else>GitHub Actions measurements for this workload will appear after the next release.</p>

CI measures with both compilers and fails a change that exceeds the instantiation, check-time, or error budgets in `packages/bench/thresholds.json`.

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
