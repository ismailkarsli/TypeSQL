import { writeFile } from "node:fs/promises";
import { generateSource, introspect } from "@typesql/mysql/introspect";
import { createConnection } from "mysql2/promise";

const db = await createConnection(process.env.DATABASE_URL!);
const schema = await introspect(db, {
	functionNotNull: (fn) => fn.name === "slugify",
});
await db.end();
await writeFile("schema.ts", generateSource(schema));
