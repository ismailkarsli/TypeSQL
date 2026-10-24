import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { startDockerPostgres, type Database } from "../conformance/db.js";

/** What `abs_srcdir` points at: the regression tests' directory, mounted for server-side COPY. */
export const REGRESS_MOUNT = "/regress";
export const regressDir = resolve(import.meta.dirname, "../../../../vendor/postgres/src/test/regress");

export async function acquireOracleServer(): Promise<Database | null> {
  const url = process.env["TYPESQL_ORACLE_URL"];
  if (url) return { url, source: "env", close: async () => {} };
  if (process.env["TYPESQL_ORACLE"] === "skip") return null;
  const mount = existsSync(join(regressDir, "sql")) ? ["-v", `${regressDir}:${REGRESS_MOUNT}:ro`] : [];
  try {
    return await startDockerPostgres(process.env["TYPESQL_PG_IMAGE"] ?? "postgres:18", mount);
  } catch (err) {
    throw new Error(`The oracle needs PostgreSQL: set TYPESQL_ORACLE_URL or make Docker available (TYPESQL_ORACLE=skip skips the run). ${(err as Error).message}`);
  }
}
