import { writeFileSync } from "node:fs";

const N = Number(process.argv[2] ?? 4096);
let s = `export interface Next {
  readonly [i: number]: number;
`;
for (let i = 0; i < N; i++) s += `  readonly ${i}: ${i + 1};\n`;
s += `}\n\nexport type MaxTokens = ${N};\n`;
writeFileSync(
	new URL(
		"../packages/core/src/postgres/engine/lexer/next.ts",
		import.meta.url,
	),
	s,
);
