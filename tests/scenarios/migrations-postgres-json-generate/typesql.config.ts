import { createMigrator } from "@typesql/core/migration";
export default createMigrator({
	dialect: "postgres",
	url: process.env.DATABASE_URL,
	migrationsDir: "./migrations",
});
