/**
 * A throwaway consumer project: `@typesql/core` built into its node_modules (with the content
 * mapper manifest), the workspace's `typescript` linked next to it, and the given files.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const core = resolve(import.meta.dirname, "../..");
const typescript = resolve(core, "../../node_modules/typescript");

export interface TempProject {
  readonly dir: string;
  readonly corePackage: string;
  write(file: string, text: string): void;
  read(file: string): string;
  /** Run the project's `tsc`; stdout and stderr together, and the exit status. */
  tsc(args: readonly string[], env?: NodeJS.ProcessEnv): { out: string; status: number | null };
  remove(): void;
}

export function tempProject(files: { readonly [path: string]: string }): TempProject {
  const dir = mkdtempSync(join(tmpdir(), "typesql-project-"));
  const corePackage = join(dir, "node_modules/@typesql/core");
  mkdirSync(corePackage, { recursive: true });
  execFileSync(join(core, "node_modules/.bin/tsc"), ["-p", join(core, "tsconfig.build.json"), "--outDir", join(corePackage, "dist"), "--declarationMap", "false", "--sourceMap", "false"]);
  copyFileSync(join(core, "package.json"), join(corePackage, "package.json"));
  symlinkSync(typescript, join(dir, "node_modules/typescript"), "dir");
  const write = (file: string, text: string): void => {
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    writeFileSync(join(dir, file), text);
  };
  for (const [file, text] of Object.entries(files)) write(file, text);
  return {
    dir,
    corePackage,
    write,
    read: (file) => readFileSync(join(dir, file), "utf8"),
    tsc(args, env) {
      const r = spawnSync(join(dir, "node_modules/typescript/bin/tsc"), args, { cwd: dir, encoding: "utf8", env: { ...process.env, ...env } });
      return { out: `${r.stdout}${r.stderr}`, status: r.status };
    },
    remove: () => rmSync(dir, { recursive: true, force: true }),
  };
}

export const tsconfig = (extra: object = {}): string =>
  JSON.stringify({
    compilerOptions: { strict: true, noEmit: true, target: "es2024", module: "nodenext", skipLibCheck: true, types: [] },
    contentMappers: [{ package: "@typesql/core", extensions: [".typesqlcache"] }],
    include: ["src"],
    ...extra,
  }, null, 2);

export const SCHEMA = `import { createSql, type Col, type Generated, type Nullable } from "@typesql/core";
export interface DB {
  users: { id: Generated<"int4">; email: Col<"text">; name: Nullable<"text"> };
  posts: { id: Generated<"int8">; author_id: Col<"int4">; title: Col<"text"> };
}
export const sql = createSql<DB>();
`;

/** n distinct statements over SCHEMA, one per line. */
export const queries = (n: number, from = 0, db = "./db.js"): string =>
  `import { sql } from "${db}";\n` +
  Array.from({ length: n }, (_, k) => {
    const i = k + from;
    return i % 2
      ? `export const q${i} = sql("SELECT u.id, u.email, p.title FROM users u JOIN posts p ON p.author_id = u.id WHERE u.id = $1 AND p.id > ${i}", 1);`
      : `export const q${i} = sql("SELECT name, count(*) AS n FROM users WHERE id > ${i} GROUP BY name");`;
  }).join("\n") + "\n";

export const instantiations = (out: string): number => Number(/Instantiations:\s+(\d+)/.exec(out)?.[1]);
export const errors = (out: string): string[] => out.split("\n").filter((l) => /error TS\d+/.test(l));
