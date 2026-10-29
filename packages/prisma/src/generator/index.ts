import { mkdir, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import type { DmmfDatamodel } from "./dmmf.js";
import { generateSource, viewNames } from "./emit.js";
import type { GeneratorHandler, GeneratorOptions } from "./protocol.js";

const configString = (
	v: string | readonly string[] | undefined,
): string | undefined => (typeof v === "string" ? v : undefined);

export function outputFile(output: string): string {
	return [".ts", ".mts", ".cts"].includes(extname(output))
		? output
		: join(output, "index.ts");
}

export function sourceFor(options: GeneratorOptions): string {
	const provider =
		options.datasources[0]?.activeProvider ?? options.datasources[0]?.provider;
	if (
		provider !== undefined &&
		provider !== "postgresql" &&
		provider !== "postgres" &&
		provider !== "sqlite"
	) {
		throw new Error(
			`typesql-prisma: only the postgresql and sqlite providers are supported (got "${provider}")`,
		);
	}
	const { importFrom, typeName } = options.generator.config;
	return generateSource(options.dmmf.datamodel as DmmfDatamodel, {
		dialect: provider === "sqlite" ? "sqlite" : "postgres",
		importFrom: configString(importFrom),
		typeName: configString(typeName),
		views: viewNames(options.datamodel),
	});
}

export const generator: GeneratorHandler = {
	onManifest: () => ({ prettyName: "TypeSQL schema", requiresEngines: [] }),
	async onGenerate(options) {
		const output = options.generator.output?.value;
		if (!output)
			throw new Error(
				'typesql-prisma: set `output` in the generator block, e.g. output = "../src/db/typesql.ts"',
			);
		const file = outputFile(output);
		await mkdir(dirname(file), { recursive: true });
		await writeFile(file, sourceFor(options));
	},
};
