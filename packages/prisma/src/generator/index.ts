import { mkdir, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { providerDialect } from "../provider.js";
import { generateSource, schemaFields, viewNames } from "./emit.js";
import type { GeneratorHandler, GeneratorOptions } from "./protocol.js";

const configString = (
	v: string | readonly string[] | undefined,
): string | undefined => (typeof v === "string" ? v : undefined);

function outputFile(output: string): string {
	return [".ts", ".mts", ".cts"].includes(extname(output))
		? output
		: join(output, "index.ts");
}

function sourceFor(options: GeneratorOptions): string {
	const dialect = providerDialect(
		options.datasources[0]?.activeProvider ?? options.datasources[0]?.provider,
	);
	const { importFrom, typeName } = options.generator.config;
	return generateSource(options.dmmf.datamodel, {
		dialect,
		importFrom: configString(importFrom),
		typeName: configString(typeName),
		views: viewNames(options.datamodel),
		fields: schemaFields(options.datamodel),
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
