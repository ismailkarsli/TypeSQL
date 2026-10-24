import { relative } from "node:path";
import type { UserConsoleLog } from "vitest";
import type { Reporter, TestModule } from "vitest/node";
import { SKIP_PREFIX } from "./db.js";

export default class DbSkipReporter implements Reporter {
  private readonly skipped = new Set<string>();

  onUserConsoleLog(log: UserConsoleLog): void {
    if (log.taskId && log.content.startsWith(SKIP_PREFIX)) this.skipped.add(log.taskId);
  }

  onTestRunEnd(modules: ReadonlyArray<TestModule>): void {
    const files = modules.filter((m) => this.skipped.has(m.id)).map((m) => relative(process.cwd(), m.moduleId)).sort();
    if (files.length) console.warn(`\nNo Postgres (set TYPESQL_PG_URL or start Docker): skipped the DB suites of ${files.length} files: ${files.join(", ")}\n`);
  }
}
