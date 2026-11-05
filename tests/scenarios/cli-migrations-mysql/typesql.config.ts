import { createMigrator } from "@typesql/core/migration";
export default createMigrator({
	dialect: "mysql",
	url: process.env.DATABASE_URL,
	migrationsDir: "./migrations",
});
