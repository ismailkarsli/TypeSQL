import { createMigrator } from "@typesql/core/migration";
export default createMigrator({
	dialect: "sqlite",
	db: process.env.SQLITE_PATH,
	migrationsDir: "./migrations",
});
