export interface ProbeDialect {
	readonly engine: string;
	readonly specifiers: readonly string[];
}
export const postgresProbe: ProbeDialect = {
	engine: "@typesql/core/postgres/engine",
	specifiers: [
		"@typesql/core/postgres/engine",
		"@typesql/core/postgres",
		"@typesql/core",
	],
};
