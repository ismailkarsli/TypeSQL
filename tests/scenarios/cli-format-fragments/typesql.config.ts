import { createMigrator } from "@typesql/core/migration";

export default createMigrator({
	dialect: "postgres",
	migrations: [],
	format: { width: 100 },
});
