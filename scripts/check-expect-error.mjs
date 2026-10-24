#!/usr/bin/env node
// `@ts-expect-error` passes on any error, so a type test of an invalid statement must assert the exact
// SqlError instead. Argument-shape errors (parameter values, missing arguments) may still use it.
import { globSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getTokenAtPosition, SyntaxKind } from "typescript/ast";
import { API } from "typescript/sync";

const root = fileURLToPath(new URL("..", import.meta.url));

const STATEMENTS = new Set([SyntaxKind.ExpressionStatement, SyntaxKind.VariableStatement, SyntaxKind.ReturnStatement]);
const SQL_CALLEE = /^\w*sql$/i;
const PLACEHOLDER = /\$\d|(?:^|[^:]):[A-Za-z_]|\{[A-Za-z_]\w*\}/;

export function findViolations(api, fileName, text) {
  const lease = api.createSourceFile(fileName, text);
  try {
    const sf = lease.sourceFile;
    const lineStarts = sf.getLineStarts();
    const found = [];
    for (const m of text.matchAll(/\/\/\s*@ts-expect-error\b|\/\*+\s*@ts-expect-error\b/g)) {
      const at = m.index;
      const token = getTokenAtPosition(sf, at);
      if (token.kind !== SyntaxKind.EndOfFile && token.getStart() <= at && at < token.end) continue; // inside a string or template
      const { line } = sf.getLineAndCharacterOfPosition(at);
      if (line + 1 >= lineStarts.length) continue;
      const statement = statementAt(sf, text, lineStarts[line + 1], lineStarts[line + 2] ?? text.length);
      if (!statement) continue;
      const kind = mentionsRow(statement) ? "row" : hasTextOnlySqlCall(statement) ? "sql" : undefined;
      if (kind) found.push({ line: line + 1, kind, statement: firstLine(statement) });
    }
    const visit = (n) => {
      if (n.kind === SyntaxKind.TypeReference && nameOf(n) === "SqlError") {
        const [message] = n.typeArguments ?? [];
        if (!message || message.kind === SyntaxKind.StringKeyword) found.push({ line: sf.getLineAndCharacterOfPosition(n.getStart()).line + 1, kind: "loose", statement: firstLine(n) });
      }
      n.forEachChild(visit);
    };
    visit(sf);
    return found.sort((a, b) => a.line - b.line);
  } finally {
    lease.dispose();
  }
}

function statementAt(sf, text, from, to) {
  let pos = from;
  while (pos < to && /\s/.test(text[pos])) pos++;
  if (pos >= to) return undefined;
  let node = getTokenAtPosition(sf, pos);
  if (node.getStart() !== pos) return undefined;
  for (; node && node.kind !== SyntaxKind.SourceFile; node = node.parent) {
    if (node.getStart() !== pos) return undefined;
    if (STATEMENTS.has(node.kind)) return node;
  }
  return undefined;
}

const firstLine = (node) => node.getText().split("\n")[0].trim();

const nameOf = (ref) => (ref.typeName.kind === SyntaxKind.QualifiedName ? ref.typeName.right : ref.typeName).text;

function mentionsRow(node) {
  let hit = false;
  const visit = (n) => {
    if (hit) return;
    if (n.kind === SyntaxKind.TypeReference && (nameOf(n) === "Row" || nameOf(n) === "RowOf")) return void (hit = true);
    n.forEachChild(visit);
  };
  visit(node);
  return hit;
}

function hasTextOnlySqlCall(node) {
  let hit = false;
  const visit = (n) => {
    if (hit) return;
    if (n.kind === SyntaxKind.CallExpression && n.expression.kind === SyntaxKind.Identifier && SQL_CALLEE.test(n.expression.text)) {
      const args = [...n.arguments];
      const [q] = args;
      if (args.length === 1 && (q.kind === SyntaxKind.StringLiteral || q.kind === SyntaxKind.NoSubstitutionTemplateLiteral) && !PLACEHOLDER.test(q.text)) return void (hit = true);
    }
    n.forEachChild(visit);
  };
  visit(node);
  return hit;
}

const LABELS = {
  row: "@ts-expect-error on a Row/RowOf assertion",
  sql: "@ts-expect-error on sql() of a statement without parameters",
  loose: "SqlError without its message",
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = process.argv.length > 2 ? process.argv.slice(2).map((f) => resolve(f)) : globSync("packages/*/test/**/*.test-d.ts", { cwd: root, exclude: ["**/node_modules/**"] }).map((f) => resolve(root, f));
  const api = new API({ cwd: root });
  const problems = [];
  try {
    for (const file of files.sort())
      for (const v of findViolations(api, file, readFileSync(file, "utf8"))) problems.push(`${relative(root, file)}:${v.line}: ${LABELS[v.kind]}: ${v.statement}`);
  } finally {
    api.close();
  }
  if (problems.length) {
    console.error(
      `check-expect-error: ${problems.length} type test(s) do not name the exact SqlError; assert it instead,\n` +
        `  expectTypeOf<V<"…">>().toEqualTypeOf<SqlError<"message", position>>()\n\n  ${problems.join("\n  ")}`,
    );
    process.exit(1);
  }
  console.log(`check-expect-error: ok (${files.length} files)`);
}
