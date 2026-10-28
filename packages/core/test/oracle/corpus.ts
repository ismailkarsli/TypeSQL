import { readFileSync } from "node:fs";

export interface CorpusStatement {
	readonly schema: string | null;
	/** Stable provenance label, retained so existing baselines keep their identity. */
	readonly source: string;
	readonly sql: string;
	readonly ddl: boolean;
}

interface Corpus {
	/** TypeScript DB types using the probe's __T import; these describe inputs, not expected results. */
	readonly schemas: Readonly<Record<string, string>>;
	readonly statements: readonly CorpusStatement[];
	readonly skippedSlots: Readonly<Record<string, number>>;
}

export function readCorpus(): Corpus {
	const corpus: Corpus = JSON.parse(
		readFileSync(new URL("./corpus.json", import.meta.url), "utf8"),
	);
	if (!corpus.statements.length)
		throw new Error("The behavior corpus is empty");
	for (const statement of corpus.statements)
		if (statement.schema !== null && !(statement.schema in corpus.schemas))
			throw new Error(`Unknown corpus schema: ${statement.schema}`);
	return corpus;
}
