import { expectTypeOf, test } from "vitest";
import type { Lex } from "../../../src/engine/lexer/lex.js";
import type { Toks } from "../../../src/engine/lexer/tokens.js";
import type { FastSelect } from "../../../src/engine/parser/fast.js";
import type { ParseProgram } from "../../../src/engine/parser/stmt.js";
import type { MaxParam } from "../../../src/engine/typer/params.js";

type Equal<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
		? true
		: false;

/** A declined optimization is valid; every recognized result must match the full parser. */
type Agreement<Q extends string> = Q extends unknown
	? FastSelect<Q> extends infer F
		? [F] extends [never]
			? true
			: Lex<Q> extends infer T
				? T extends Toks
					? Equal<F, { stmt: ParseProgram<T>; max: MaxParam<T> }>
					: false
				: false
		: false
	: never;

test("recognized SELECT parses agree with the independent complete parser", () => {
	type Queries =
		| "SELECT id FROM items"
		| "SELECT id\nFROM items"
		| 'SELECT "i".id, "i".note AS "label" FROM items AS "i"'
		| 'SELECT "" FROM items'
		| 'SELECT "".id FROM items'
		| 'SELECT select.id FROM items AS "select"'
		| "select ID, note from ITEMS"
		| "SELECT\nid,\tnote\nFROM\titems\nWHERE id = $1"
		| "SELECT * FROM items"
		| "SELECT i.* FROM public.items i"
		| "SELECT i.id AS key, i.note label FROM items AS i WHERE i.id = $1 ORDER BY i.note DESC NULLS FIRST LIMIT $2 OFFSET $3"
		| "SELECT i.id FROM (SELECT id FROM items ORDER BY id LIMIT 1) i ORDER BY i.id DESC LIMIT $1"
		| "SELECT i.id FROM (SELECT id FROM items ORDER BY id) i ORDER BY i.id ASC"
		| "SELECT note FROM items ORDER BY 'order by x'"
		| "SELECT id FROM items -- ORDER BY note\nORDER BY id"
		| "SELECT id AS duplicate, note AS duplicate FROM items"
		| "SELECT note AS duplicate, id AS duplicate FROM items"
		| 'SELECT "a""b" AS "x""y" FROM "some""table"'
		| 'SELECT "has space", "a,b", Ä, ä FROM names'
		| "SELECT cafÉ FROM names"
		| 'SELECT "select" FROM "where"'
		| 'SELECT "WHERE" AS "FROM" FROM "AS"'
		| "SELECT id AS from FROM items"
		| "SELECT id and FROM items"
		| "SELECT count(*) AS total, coalesce(note, 'n/a') AS label FROM items GROUP BY note HAVING count(*) > 1 ORDER BY note"
		| "SELECT id + 1 AS next, payload ->> 'a' AS value FROM items WHERE id = $1"
		| "SELECT current_date AS today FROM items"
		| "SELECT i.id, o.note FROM items i LEFT JOIN others o ON o.id = i.id WHERE o.note IS NOT NULL"
		| "SELECT i.id FROM items i WHERE EXISTS (SELECT 1 FROM others o WHERE o.id = i.id AND o.note = $2)"
		| "SELECT i.id FROM (SELECT id FROM items WHERE id = $1) AS i"
		| "SELECT id FROM items;"
		| "SELECT DISTINCT id FROM items"
		| "SELECT DISTINCT ON (id) id, note FROM items ORDER BY id, note"
		| "SELECT $1 AS value FROM items"
		| "SELECT id FROM items WHERE id = $3"
		| "SELECT idFROM items"
		| "SELECT idfrom items"
		| "SELECT id AS key extra FROM items"
		| "SELECT id key extra FROM items"
		| "SELECT id from FROM items"
		| "SELECT id -- FROM items"
		| "SELECT id -- ignored FROM bogus\nFROM items"
		| "SELECT id /* FROM absent */ FROM items"
		| "SELECT ' FROM absent' AS value, id FROM items"
		| "SELECT id FROM items; SELECT note FROM items";
	expectTypeOf<Agreement<Queries>>().toEqualTypeOf<true>();
});
