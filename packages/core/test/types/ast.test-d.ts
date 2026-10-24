import { expectTypeOf, test } from "vitest";
import type { ExprNode, Stmt } from "../../src/engine/ast.js";
import type { Lex, ParseProgram } from "../../src/engine/index.js";

// The parser builds its trees as literal types, which nothing checks against the declared AST
// types (ast.ts): these statements, one per kind of node, keep the two in step. `Expr` is
// shallow on purpose (see ast.ts), so expression nodes are checked against `ExprNode`, one
// level deep.

type Parsed<Q extends string> = ParseProgram<Lex<Q>>;
/** The select list's expressions of `SELECT …`. */
type Targets<Q extends string> =
	Parsed<Q> extends {
		readonly body: { readonly targets: readonly (infer T)[] };
	}
		? T extends { readonly e: infer E }
			? E
			: never
		: never;

test("expression nodes conform to ExprNode", () => {
	expectTypeOf<
		Targets<"SELECT a IS NULL, a IS TRUE, a IS NOT FALSE, a IS UNKNOWN">
	>().toExtend<ExprNode>();
	expectTypeOf<
		Targets<"SELECT a LIKE 'x', a ILIKE 'x', a SIMILAR TO 'x', a = ANY (b), a < ALL (b)">
	>().toExtend<ExprNode>();
	expectTypeOf<
		Targets<"SELECT trim(a), trim(both 'x' from a), trim(leading from a), trim(trailing 'x' from a)">
	>().toExtend<ExprNode>();
	expectTypeOf<
		Targets<"SELECT xmlconcat(a, b), xmlelement(name e, a), xmlforest(a), xmlpi(name p), xmlroot(a, version '1.0'), xmlparse(document a), xmlserialize(content a AS text), a IS DOCUMENT">
	>().toExtend<ExprNode>();
	expectTypeOf<
		Targets<"SELECT JSON(a), JSON_SCALAR(a), JSON_SERIALIZE(a), JSON_OBJECT('k': a), JSON_ARRAY(a), JSON_EXISTS(a, '$'), JSON_VALUE(a, '$'), JSON_QUERY(a, '$')">
	>().toExtend<ExprNode>();
	expectTypeOf<
		Targets<"SELECT JSON_OBJECTAGG(k: v), JSON_ARRAYAGG(v)">
	>().toExtend<ExprNode>();
});

test("statements conform to Stmt", () => {
	expectTypeOf<
		Parsed<"SELECT 1 FROM a JOIN b ON true LEFT JOIN c ON true RIGHT JOIN d ON true FULL JOIN e ON true CROSS JOIN f">
	>().toExtend<Stmt>();
	expectTypeOf<
		Parsed<"SELECT 1 UNION SELECT 2 INTERSECT SELECT 3 EXCEPT SELECT 4">
	>().toExtend<Stmt>();
	expectTypeOf<
		Parsed<"UPDATE t SET a = 1 RETURNING WITH (OLD AS o, NEW AS n) o.a, n.a">
	>().toExtend<Stmt>();
	expectTypeOf<
		Parsed<"MERGE INTO t USING s ON true WHEN MATCHED THEN DELETE WHEN NOT MATCHED BY SOURCE THEN DELETE WHEN NOT MATCHED THEN DO NOTHING">
	>().toExtend<Stmt>();
	expectTypeOf<Parsed<"FETCH NEXT FROM c">>().toExtend<Stmt>();
	expectTypeOf<Parsed<"MOVE c">>().toExtend<Stmt>();
});
