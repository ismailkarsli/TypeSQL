import { execFile } from "node:child_process";
import { createServer } from "node:net";
import { promisify } from "node:util";
import { Client } from "pg";

const execFileAsync = promisify(execFile);

export interface Database {
  readonly url: string;
  readonly source: "env" | "docker";
  close(): Promise<void>;
}

/**
 * Resolve a Postgres to test against:
 *   1. `TYPESQL_PG_URL` if set (the schema there is dropped and recreated).
 *   2. Otherwise start `postgres:17` (override with `TYPESQL_PG_IMAGE`) through the docker CLI on a
 *      random free port, wait until it accepts connections, and remove it on `close()`.
 * Returns `null` when neither is possible so callers can skip instead of fail.
 */
export async function acquireDatabase(): Promise<Database | null> {
  const url = process.env["TYPESQL_PG_URL"];
  if (url) return { url, source: "env", close: async () => {} };
  try {
    return await startDockerPostgres(process.env["TYPESQL_PG_IMAGE"] ?? "postgres:17");
  } catch (err) {
    console.warn(`[conformance] skipped: no TYPESQL_PG_URL and docker Postgres unavailable (${(err as Error).message})`);
    return null;
  }
}

async function startDockerPostgres(image: string): Promise<Database> {
  const port = await freePort();
  const { stdout } = await execFileAsync("docker", [
    "run", "-d", "--rm",
    "-e", "POSTGRES_PASSWORD=typesql",
    "-p", `127.0.0.1:${port}:5432`,
    image,
  ], { timeout: 60_000 });
  const id = stdout.trim();
  const url = `postgres://postgres:typesql@127.0.0.1:${port}/postgres`;
  const close = async () => {
    await execFileAsync("docker", ["rm", "-f", id], { timeout: 30_000 }).catch(() => undefined);
  };
  try {
    await waitUntilReady(url, 60_000);
  } catch (err) {
    await close();
    throw err;
  }
  return { url, source: "docker", close };
}

/** The entrypoint first runs a socket-only bootstrap server, so poll over TCP until a real connection works. */
async function waitUntilReady(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    const client = new Client({ connectionString: url, connectionTimeoutMillis: 2_000 });
    try {
      await client.connect();
      await client.query("SELECT 1");
      await client.end();
      return;
    } catch (err) {
      lastError = err;
      await client.end().catch(() => undefined);
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  throw new Error(`Postgres did not become ready within ${timeoutMs} ms: ${(lastError as Error)?.message ?? lastError}`);
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => (port ? resolve(port) : reject(new Error("no free port"))));
    });
  });
}
