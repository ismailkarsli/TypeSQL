import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync(process.env.SQLITE_PATH!);
// `docs_archive` is an ordinary table whose name starts like the shadow tables
// of the virtual table `docs` (docs_data, docs_idx, docs_content, …).
db.exec(`
	CREATE VIRTUAL TABLE docs USING fts5(title);
	CREATE TABLE docs_archive (id integer PRIMARY KEY, title text NOT NULL);
	INSERT INTO docs_archive VALUES (1, 'Old');
`);
db.close();
