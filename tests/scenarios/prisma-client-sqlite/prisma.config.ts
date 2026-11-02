import { defineConfig } from "prisma/config";
export default defineConfig({
	schema: "schema.prisma",
	datasource: { url: `file:${process.env.SQLITE_PATH}` },
});
