// Runtime word lists for editor tooling such as @typesql/language-server. The
// parsers read the same lists as types, so a keyword added there is quoted in
// completions too.
import * as mysql from "./mysql/engine/parser/keywords.js";
import * as postgres from "./postgres/engine/parser/keywords.js";
import * as sqlite from "./sqlite/engine/parser/keywords.js";

export { META_KEYS } from "./schema.js";

/** Per dialect, the words a table, column or alias name must be quoted to be. */
export const RESERVED_WORDS = {
	postgres: [
		...postgres.RESERVED_KEYWORDS,
		...postgres.TYPE_FUNC_NAME_KEYWORDS,
	],
	sqlite: [...sqlite.RESERVED, ...sqlite.JOIN_KEYWORDS],
	// Either server's, so a name is quoted wherever one of them needs it.
	mysql: [...mysql.RESERVED, ...mysql.SINGLE_SERVER_RESERVED],
} as const;
