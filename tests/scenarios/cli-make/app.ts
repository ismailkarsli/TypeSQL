import { createMigrator } from "@typesql/core/migration";
import first from "./migrations/1793356800_create-users.js";
const migrator = createMigrator({
	dialect: "postgres",
	url: process.env.DATABASE_URL,
	migrationsDir: "./migrations",
	generate: false,
});
console.log({ up: typeof first.up, result: await migrator.latest() });
