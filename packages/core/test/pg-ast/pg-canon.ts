/**
 * Must print libpg_query's parse tree exactly as canon.ts prints our AST: change both together.
 * Our parser's deliberate rewrites and omissions are mirrored here, each naming the parser rule.
 */

export const OUT = "…";

type Json = { readonly [k: string]: any };

function unwrap(node: Json): [string, Json] {
  const k = Object.keys(node)[0];
  if (k === undefined) return ["", {}];
  return [k, node[k] as Json];
}

/**
 * Our parser's aliases (schema/normalize.ts `TypeAliases`) for names Postgres keeps as written
 * (it resolves keyword spellings itself). `"char"` is deliberately unmapped: our parser reading
 * it as `bpchar` is a real difference.
 */
const TYPE_ALIASES: { readonly [k: string]: string } = {
  int: "int4", integer: "int4", serial: "int4", serial4: "int4",
  smallint: "int2", smallserial: "int2", serial2: "int2",
  bigint: "int8", bigserial: "int8", serial8: "int8",
  real: "float4", float: "float8",
  decimal: "numeric", dec: "numeric",
  boolean: "bool", citext: "text",
  character: "bpchar",
};

export class PgCanon {
  private readonly src: Buffer;

  constructor(sql: string) {
    this.src = Buffer.from(sql, "utf8");
  }

  private at(loc: number | undefined, n = 64): string {
    if (loc === undefined || loc < 0) return "";
    return this.src.subarray(loc, loc + n).toString("utf8");
  }

  stmt(node: Json): string {
    const [k, n] = unwrap(node);
    switch (k) {
      case "SelectStmt":
        // SELECT … INTO t: our parser makes it CREATE TABLE AS (parser/stmt.ts `SelectInto`)
        if (n.intoClause && (n.op ?? "SETOP_NONE") === "SETOP_NONE") return `CREATE TABLE ${this.rangeVarName(n.intoClause.rel)} AS ${this.select({ ...n, intoClause: undefined })}`;
        return this.select(n);
      case "InsertStmt":
        return this.insert(n);
      case "UpdateStmt":
        return this.update(n);
      case "DeleteStmt":
        return this.delete(n);
      case "MergeStmt":
        return this.merge(n);
      case "DeclareCursorStmt":
        return `DECLARE ${n.portalname} CURSOR FOR ${this.selectNode(n.query)}`;
      case "ViewStmt":
        return `CREATE VIEW ${this.rangeVarName(n.view)}${this.nameList(n.aliases)} AS ${this.selectNode(n.query)}`;
      case "CreateTableAsStmt": {
        const what = n.objtype === "OBJECT_MATVIEW" ? "MATERIALIZED VIEW" : "TABLE";
        const [qk, q] = unwrap(n.query);
        // `AS EXECUTE name(…)`: our AST keeps the name only (ast.ts `ExecuteSource`)
        const body = qk === "ExecuteStmt" ? `EXECUTE ${q.name}` : this.selectNode(n.query);
        return `CREATE ${what} ${this.rangeVarName(n.into.rel)}${this.nameList(n.into.colNames)} AS ${body}`;
      }
      case "CreateStmt":
        return this.createTable(n);
      case "AlterTableStmt":
        if (!RELATIONS.has(n.objtype)) return OUT;
        return `ALTER TABLE ${n.missing_ok ? "IF EXISTS " : ""}${this.rangeVarName(n.relation)} ${(n.cmds as Json[]).map((c) => this.alterCmd(unwrap(c)[1])).join(", ")}`;
      case "RenameStmt":
        return this.rename(n);
      case "AlterObjectSchemaStmt":
        if (!RELATIONS.has(n.objectType)) return OUT;
        return `ALTER TABLE ${n.missing_ok ? "IF EXISTS " : ""}${this.rangeVarName(n.relation)} SET SCHEMA ${n.newschema}`;
      case "DropStmt":
        return this.drop(n);
      case "CreateEnumStmt":
        return `CREATE TYPE ${this.qualified(n.typeName)} AS ENUM (${this.names(n.vals).map((v) => `'${v}'`).join(", ")})`;
      case "AlterEnumStmt":
        return n.oldVal !== undefined
          ? `ALTER TYPE ${this.qualified(n.typeName)} RENAME VALUE '${n.oldVal}' TO '${n.newVal}'`
          : `ALTER TYPE ${this.qualified(n.typeName)} ADD VALUE ${n.skipIfNewValExists ? "IF NOT EXISTS " : ""}'${n.newVal}'`;
      case "CreateSchemaStmt":
        return this.createSchema(n);
      case "CreateFunctionStmt": {
        if (n.is_procedure) return OUT;
        // without RETURNS (OUT parameters) our parser does not know the result (parser/ddl.ts `FnReturns`)
        const ret = n.returnType ? `${n.returnType.setof ? "SETOF " : ""}${this.typeName(n.returnType)}` : "unknown";
        return `CREATE FUNCTION ${this.qualified(n.funcname)} RETURNS ${ret}`;
      }
      case "FetchStmt":
        // the direction is skipped by our parser (parser/utility.ts `FetchDirection`)
        return `${n.ismove ? "MOVE" : "FETCH"} ${n.portalname}`;
      case "ClosePortalStmt":
        return `CLOSE ${n.portalname ?? "ALL"}`;
      default:
        return OUT;
    }
  }

  /** Our `TableRef` keeps the last two parts. */
  private qualified(list: Json[]): string {
    const parts = this.names(list);
    return parts.length >= 2 ? `${parts.at(-2)}.${parts.at(-1)}` : parts[0]!;
  }

  /** As parser/ddl.ts `ParseCreateTable` keeps it: a typed table or a partition has no elements. */
  private createTable(n: Json, schema?: string): string {
    const name = schema === undefined ? this.rangeVarName(n.relation) : `${schema}.${n.relation.relname}`;
    let s = `CREATE TABLE ${n.if_not_exists ? "IF NOT EXISTS " : ""}${name}`;
    if (n.ofTypename) s += ` OF ${this.qualified(n.ofTypename.names)}`;
    const elts = (n.ofTypename || n.partbound ? [] : (n.tableElts ?? [])) as Json[];
    const cols: string[] = [];
    const cons: string[] = [];
    const likes: string[] = [];
    for (const e of elts) {
      const [k, x] = unwrap(e);
      if (k === "ColumnDef") cols.push(this.columnDef(x));
      else if (k === "Constraint") cons.push(this.tableConstraint(x));
      // 56: CREATE_TABLE_LIKE_DEFAULTS | GENERATED | IDENTITY, the options our parser copies defaults for
      else if (k === "TableLikeClause") likes.push(`LIKE ${this.rangeVarName(x.relation)}${(x.options ?? 0) & 56 ? " DEFAULTS" : ""}`);
      else cols.push(`?${k}`);
    }
    s += ` (${[...cols, ...cons, ...likes].join(", ")})`;
    if (n.inhRelations?.length) s += ` INHERITS (${(n.inhRelations as Json[]).map((r) => this.rangeVarName(unwrap(r)[1])).join(", ")})`;
    return s;
  }

  private columnDef(c: Json): string {
    const kinds = new Set(((c.constraints ?? []) as Json[]).map((x) => unwrap(x)[1].contype as string));
    // a serial type is spelled as an unquoted word (our parser looks at the word token)
    const serial = /^(?:serial[248]?|smallserial|bigserial)$/i.test(/^\w+/.exec(this.at(c.typeName?.location, 16))?.[0] ?? "");
    const pk = kinds.has("CONSTR_PRIMARY");
    const notNull = pk || serial || kinds.has("CONSTR_NOTNULL") || kinds.has("CONSTR_IDENTITY");
    const hasDefault = serial || kinds.has("CONSTR_DEFAULT") || kinds.has("CONSTR_IDENTITY") || kinds.has("CONSTR_GENERATED");
    return `${c.colname} ${this.typeName(c.typeName)}${notNull ? " NOT NULL" : ""}${hasDefault ? " DEFAULT" : ""}${pk ? " PRIMARY KEY" : ""}`;
  }

  /** NOT NULL … NOT VALID is not kept (parser/ddl.ts `ParseNotNullConstraint`). */
  private tableConstraint(c: Json): string {
    if (c.contype === "CONSTR_PRIMARY" && c.keys) return `PRIMARY KEY (${this.names(c.keys).join(", ")})`;
    if (c.contype === "CONSTR_NOTNULL" && c.keys && !c.skip_validation) return `NOT NULL ${this.names(c.keys)[0]}`;
    return `CONSTRAINT ${OUT}`;
  }

  private alterCmd(c: Json): string {
    const col = `ALTER COLUMN ${c.name}`;
    switch (c.subtype) {
      case "AT_AddColumn":
        return `ADD COLUMN ${c.missing_ok ? "IF NOT EXISTS " : ""}${this.columnDef(unwrap(c.def)[1])}`;
      case "AT_DropColumn":
        return `DROP COLUMN ${c.missing_ok ? "IF EXISTS " : ""}${c.name}`;
      case "AT_AlterColumnType":
        return `${col} TYPE ${this.typeName(unwrap(c.def)[1].typeName)}`;
      case "AT_SetNotNull":
        return `${col} SET NOT NULL`;
      case "AT_DropNotNull":
        return `${col} DROP NOT NULL`;
      case "AT_ColumnDefault":
        return `${col} ${c.def ? "SET" : "DROP"} DEFAULT`;
      // DROP IDENTITY / DROP EXPRESSION remove the default (parser/ddl.ts `ParseAlterColumn`)
      case "AT_DropIdentity":
      case "AT_DropExpression":
        return `${col} DROP DEFAULT`;
      case "AT_AddIdentity":
        return `${col} ADD IDENTITY`;
      case "AT_AddConstraint": {
        const k = unwrap(c.def)[1];
        // ADD [CONSTRAINT n] NOT NULL c is SET NOT NULL (parser/ddl.ts `ParseAddConstraintBody`); PRIMARY KEY USING INDEX is not kept
        if (k.contype === "CONSTR_PRIMARY" && k.keys && !k.indexname) return `ADD PRIMARY KEY (${this.names(k.keys).join(", ")})`;
        if (k.contype === "CONSTR_NOTNULL" && k.keys && !k.skip_validation) return `ALTER COLUMN ${this.names(k.keys)[0]} SET NOT NULL`;
        return OUT;
      }
      default:
        return OUT;
    }
  }

  private rename(n: Json): string {
    const table = (): string => `ALTER TABLE ${n.missing_ok ? "IF EXISTS " : ""}${this.rangeVarName(n.relation)}`;
    switch (n.renameType) {
      case "OBJECT_COLUMN":
        return RELATIONS.has(n.relationType) ? `${table()} RENAME COLUMN ${n.subname} TO ${n.newname}` : OUT;
      case "OBJECT_TABLE":
      case "OBJECT_VIEW":
      case "OBJECT_MATVIEW":
        return `${table()} RENAME TO ${n.newname}`;
      case "OBJECT_TABCONSTRAINT":
        return RELATIONS.has(n.relationType ?? "OBJECT_TABLE") ? `${table()} ${OUT}` : OUT;
      case "OBJECT_SCHEMA":
        return `ALTER SCHEMA ${n.subname} RENAME TO ${n.newname}`;
      case "OBJECT_TYPE":
        return `ALTER TYPE ${this.qualified(unwrap(n.object)[1].items ?? [n.object])} RENAME TO ${n.newname}`;
      default:
        return OUT;
    }
  }

  private drop(n: Json): string {
    const ife = n.missing_ok ? "IF EXISTS " : "";
    const cascade = n.behavior === "DROP_CASCADE" ? " CASCADE" : "";
    const objects = (n.objects ?? []) as Json[];
    const lists = (): string => objects.map((o) => this.qualified(unwrap(o)[1].items)).join(", ");
    switch (n.removeType) {
      case "OBJECT_TABLE":
        return `DROP TABLE ${ife}${lists()}`;
      case "OBJECT_VIEW":
        return `DROP VIEW ${ife}${lists()}`;
      case "OBJECT_MATVIEW":
        return `DROP MATERIALIZED VIEW ${ife}${lists()}`;
      case "OBJECT_TYPE":
        return `DROP TYPE ${ife}${objects.map((o) => this.qualified(unwrap(o)[1].names)).join(", ")}${cascade}`;
      case "OBJECT_SCHEMA":
        return `DROP SCHEMA ${ife}${this.names(objects).join(", ")}${cascade}`;
      default:
        return OUT;
    }
  }

  /** As parser/ddl.ts `ParseCreateSchema` keeps it: its tables, then its views, both created in it. */
  private createSchema(n: Json): string {
    const role = n.authrole as Json | undefined;
    const name: string = n.schemaname ?? role?.rolename ?? (ROLE_SPECS[role?.roletype as string] ?? "?role");
    const elts = ((n.schemaElts ?? []) as Json[]).map((e) => unwrap(e));
    const tables = elts.filter(([k]) => k === "CreateStmt").map(([, x]) => this.createTable(x, name));
    const views = elts.filter(([k]) => k === "ViewStmt").map(([, x]) => `CREATE VIEW ${name}.${x.view.relname}${this.nameList(x.aliases)} AS ${this.selectNode(x.query)}`);
    const all = [...tables, ...views];
    return `CREATE SCHEMA ${n.if_not_exists ? "IF NOT EXISTS " : ""}${name}${all.length ? ` (${all.join("; ")})` : ""}`;
  }

  selectNode(node: Json): string {
    const [k, n] = unwrap(node);
    return k === "SelectStmt" ? this.select(n) : this.stmt(node);
  }

  private withClause(w: Json | undefined): string {
    if (!w) return "";
    const ctes = (w.ctes as Json[]).map((c) => {
      const cte = unwrap(c)[1];
      let s = `${cte.ctename}${this.nameList(cte.aliascolnames)} AS (${this.selectNode(cte.ctequery)})`;
      const sc = cte.search_clause;
      if (sc) s += ` SEARCH ${sc.search_breadth_first ? "BREADTH" : "DEPTH"} FIRST BY ${this.names(sc.search_col_list).join(", ")} SET ${sc.search_seq_column}`;
      const cy = cte.cycle_clause;
      if (cy) {
        s += ` CYCLE ${this.names(cy.cycle_col_list).join(", ")} SET ${cy.cycle_mark_column}`;
        // without TO … DEFAULT the grammar fills in true / false (no location); our AST keeps null
        const [vk, v] = cy.cycle_mark_value ? unwrap(cy.cycle_mark_value) : ["", {}];
        if (vk && !(vk === "A_Const" && !(v.location >= 0))) s += ` TO ${this.expr(cy.cycle_mark_value)} DEFAULT ${this.expr(cy.cycle_mark_default)}`;
        s += ` USING ${cy.cycle_path_column}`;
      }
      return s;
    });
    return `WITH ${w.recursive ? "RECURSIVE " : ""}${ctes.join(", ")} `;
  }

  /** `LIMIT ALL` is a NULL constant at the ALL keyword; our parser keeps no limit (select.ts `ParseLimitOffset`). */
  private limitOf(n: Json): Json | undefined {
    const l = n.limitCount;
    if (!l) return undefined;
    const [k, c] = unwrap(l);
    if (k === "A_Const" && c.isnull && /^all\b/i.test(this.at(c.location, 4))) return undefined;
    return l;
  }

  select(n: Json): string {
    let s = this.withClause(n.withClause) + this.body(n);
    if (n.sortClause?.length) s += ` ORDER BY ${this.exprs(n.sortClause)}`;
    const limit = this.limitOf(n);
    if (limit) s += ` LIMIT ${this.expr(limit)}`;
    if (n.limitOffset) s += ` OFFSET ${this.expr(n.limitOffset)}`;
    return s;
  }

  private hasClauses(n: Json): boolean {
    return !!(n.withClause || n.sortClause?.length || this.limitOf(n) || n.limitOffset);
  }

  /** `larg` / `rarg` are SelectStmt structs, not wrapped nodes. */
  private operand(n: Json): string {
    return this.hasClauses(n) ? `(${this.select(n)})` : this.body(n);
  }

  private body(n: Json): string {
    const op = n.op ?? "SETOP_NONE";
    if (op !== "SETOP_NONE") {
      const word = op === "SETOP_UNION" ? "UNION" : op === "SETOP_INTERSECT" ? "INTERSECT" : "EXCEPT";
      return `(${this.operand(n.larg)} ${word}${n.all ? " ALL" : ""} ${this.operand(n.rarg)})`;
    }
    if (n.valuesLists) return this.values(n.valuesLists);
    let s = "SELECT";
    const distinct = n.distinctClause as Json[] | undefined;
    if (distinct) s += distinct.every((d) => Object.keys(d).length === 0) ? " DISTINCT" : ` DISTINCT ON (${this.exprs(distinct)})`;
    if (n.targetList?.length) s += ` ${this.targets(n.targetList)}`;
    if (n.fromClause?.length) s += ` FROM ${this.fromList(n.fromClause)}`;
    if (n.whereClause) s += ` WHERE ${this.expr(n.whereClause)}`;
    if (n.groupClause) s += ` GROUP BY${this.groupBy(n.groupClause)}`;
    if (n.havingClause) s += ` HAVING ${this.expr(n.havingClause)}`;
    if (n.windowClause?.length) {
      s += ` WINDOW ${(n.windowClause as Json[]).map((w) => { const d = unwrap(w)[1]; return `${d.name} AS ${this.windowSpec(d, true)}`; }).join(", ")}`;
    }
    return s;
  }

  private values(lists: Json[]): string {
    return `VALUES ${lists.map((l) => `(${this.exprs(unwrap(l)[1].items ?? [])})`).join(", ")}`;
  }

  /**
   * Our AST keeps a flat list and a grouping-sets flag (select.ts `ParseGroupItems`): ROLLUP /
   * CUBE contribute their items, GROUPING SETS (…) and `()` nothing.
   */
  private groupBy(items: Json[]): string {
    let sets = false;
    const flat: Json[] = [];
    for (const it of items) {
      const [k, g] = unwrap(it);
      if (k !== "GroupingSet") {
        flat.push(it);
        continue;
      }
      sets = true;
      if (g.kind === "GROUPING_SET_ROLLUP" || g.kind === "GROUPING_SET_CUBE") flat.push(...(g.content ?? []));
    }
    return `${sets ? " [SETS]" : ""}${flat.length ? ` ${this.exprs(flat)}` : ""}`;
  }

  private targets(list: Json[]): string {
    return list.map((t) => {
      const r = unwrap(t)[1];
      return r.name !== undefined ? `${this.expr(r.val)} AS ${r.name}` : this.expr(r.val);
    }).join(", ");
  }

  private returning(rc: Json | undefined): string {
    if (!rc) return "";
    const opts = (rc.options ?? []) as Json[];
    const w = opts.length ? `WITH (${opts.map((o) => { const r = unwrap(o)[1]; return `${r.option === "RETURNING_OPTION_OLD" ? "OLD" : "NEW"} AS ${r.value}`; }).join(", ")}) ` : "";
    return ` RETURNING ${w}${this.targets(rc.exprs ?? [])}`;
  }

  private dmlTarget(rv: Json): string {
    return `${this.rangeVarName(rv)}${rv.alias ? ` AS ${rv.alias.aliasname}` : ""}`;
  }

  private assignTarget(r: Json): string {
    return this.indirect(r.name, r.indirection ?? []);
  }

  private insert(n: Json): string {
    let s = `${this.withClause(n.withClause)}INSERT INTO ${this.dmlTarget(n.relation)}`;
    if (n.cols?.length) s += ` (${(n.cols as Json[]).map((c) => this.assignTarget(unwrap(c)[1])).join(", ")})`;
    s += n.selectStmt ? ` ${this.selectNode(n.selectStmt)}` : " DEFAULT VALUES";
    const oc = n.onConflictClause;
    // the conflict target is parsed and discarded by our parser (dml.ts `ParseConflictTarget`)
    if (oc) s += oc.action === "ONCONFLICT_UPDATE" ? ` ON CONFLICT DO UPDATE SET ${this.setList(oc.targetList)}${oc.whereClause ? ` WHERE ${this.expr(oc.whereClause)}` : ""}` : " ON CONFLICT DO NOTHING";
    return s + this.returning(n.returningClause);
  }

  /** Postgres splits `(a, b) = e` into one target per column (`MultiAssignRef`); they are joined back. */
  private setList(list: Json[]): string {
    const out: string[] = [];
    for (let i = 0; i < list.length; i++) {
      const r = unwrap(list[i]!)[1];
      const [vk, v] = r.val ? unwrap(r.val) : ["", {}];
      if (vk === "MultiAssignRef") {
        const cols = [this.assignTarget(r)];
        for (let j = 1; j < v.ncolumns; j++) cols.push(this.assignTarget(unwrap(list[i + j]!)[1]));
        out.push(`(${cols.join(", ")}) = ${this.expr(v.source)}`);
        i += v.ncolumns - 1;
      } else out.push(`${this.assignTarget(r)} = ${this.expr(r.val)}`);
    }
    return out.join(", ");
  }

  /** `WHERE CURRENT OF cursor` is no condition in our AST (dml.ts `ParseDmlWhere`). */
  private where(w: Json | undefined): string {
    if (!w || unwrap(w)[0] === "CurrentOfExpr") return "";
    return ` WHERE ${this.expr(w)}`;
  }

  private update(n: Json): string {
    let s = `${this.withClause(n.withClause)}UPDATE ${this.dmlTarget(n.relation)} SET ${this.setList(n.targetList)}`;
    if (n.fromClause?.length) s += ` FROM ${this.fromList(n.fromClause)}`;
    return s + this.where(n.whereClause) + this.returning(n.returningClause);
  }

  private delete(n: Json): string {
    let s = `${this.withClause(n.withClause)}DELETE FROM ${this.dmlTarget(n.relation)}`;
    if (n.usingClause?.length) s += ` USING ${this.fromList(n.usingClause)}`;
    return s + this.where(n.whereClause) + this.returning(n.returningClause);
  }

  private merge(n: Json): string {
    let s = `${this.withClause(n.withClause)}MERGE INTO ${this.dmlTarget(n.relation)} USING ${this.from(n.sourceRelation)} ON ${this.expr(n.joinCondition)}`;
    for (const w of n.mergeWhenClauses as Json[]) {
      const c = unwrap(w)[1];
      const match = c.matchKind === "MERGE_WHEN_MATCHED" ? "MATCHED" : c.matchKind === "MERGE_WHEN_NOT_MATCHED_BY_SOURCE" ? "NOT MATCHED BY SOURCE" : "NOT MATCHED";
      s += ` WHEN ${match}${c.condition ? ` AND ${this.expr(c.condition)}` : ""} THEN `;
      switch (c.commandType) {
        case "CMD_UPDATE":
          s += `UPDATE SET ${this.setList(c.targetList)}`;
          break;
        case "CMD_DELETE":
          s += "DELETE";
          break;
        case "CMD_INSERT": {
          const cols = (c.targetList ?? []) as Json[];
          s += `INSERT${cols.length ? ` (${cols.map((t) => this.assignTarget(unwrap(t)[1])).join(", ")})` : ""}`;
          s += c.values ? ` VALUES (${this.exprs(c.values)})` : " DEFAULT VALUES";
          break;
        }
        default:
          s += "DO NOTHING";
      }
    }
    return s + this.returning(n.returningClause);
  }

  private fromList(list: Json[]): string {
    return list.map((f) => this.from(f)).join(", ");
  }

  private rangeVarName(rv: Json): string {
    return rv.schemaname ? `${rv.schemaname}.${rv.relname}` : rv.relname;
  }

  private alias(a: Json | undefined): string {
    if (!a) return "";
    return ` AS ${a.aliasname}${this.nameList(a.colnames)}`;
  }

  private nameList(list: Json[] | undefined): string {
    return list?.length ? `(${this.names(list).join(", ")})` : "";
  }

  private names(list: Json[] | undefined): string[] {
    return (list ?? []).map((x) => {
      const [k, v] = unwrap(x);
      return k === "String" ? (v.sval ?? "") : k === "A_Star" ? "*" : `?${k}`;
    });
  }

  private colDefs(list: Json[]): string {
    return `(${list.map((d) => { const c = unwrap(d)[1]; return `${c.colname} ${this.typeName(c.typeName)}`; }).join(", ")})`;
  }

  from(node: Json): string {
    const [k, n] = unwrap(node);
    switch (k) {
      case "RangeVar":
        // ONLY and the inheritance `*` are accepted and dropped (select.ts `SkipInheritanceStar`)
        return `${this.rangeVarName(n)}${this.alias(n.alias)}`;
      case "RangeSubselect":
        return `${n.lateral ? "LATERAL " : ""}(${this.selectNode(n.subquery)})${this.alias(n.alias)}`;
      case "RangeFunction": {
        const items = (n.functions as Json[]).map((f) => unwrap(f)[1].items as Json[]);
        let s = n.lateral ? "LATERAL " : "";
        if (n.is_rowsfrom) s += `ROWS FROM (${items.map(([call, defs]) => `${this.expr(call!)}${defs && unwrap(defs)[1].items ? ` AS ${this.colDefs(unwrap(defs)[1].items)}` : ""}`).join(", ")})`;
        else s += this.expr(items[0]![0]!);
        if (n.ordinality) s += " WITH ORDINALITY";
        if (n.alias) s += ` AS ${n.alias.aliasname}${n.coldeflist ? "" : this.nameList(n.alias.colnames)}`;
        if (n.coldeflist) s += ` ${this.colDefs(n.coldeflist)}`;
        return s;
      }
      case "JoinExpr": {
        const j = this.join(n);
        // an alias on a parenthesized join: our parser makes it `(SELECT * FROM join) alias`,
        // LATERAL (select.ts `ParseParenJoinAlias`); `USING (…) AS name` is dropped (`SkipUsingAlias`)
        return n.alias ? `LATERAL (SELECT * FROM ${j})${this.alias(n.alias)}` : j;
      }
      case "RangeTableSample":
        return `${this.from(n.relation)} TABLESAMPLE ${this.names(n.method).at(-1)}(${this.exprs(n.args ?? [])})${n.repeatable ? ` REPEATABLE (${this.expr(n.repeatable)})` : ""}`;
      case "RangeTableFunc":
        return `XMLTABLE(${OUT})${this.alias(n.alias)}`;
      case "JsonTable":
        return `JSON_TABLE(${OUT})${this.alias(n.alias)}`;
      default:
        return `?${k}`;
    }
  }

  private join(n: Json): string {
    const kind = n.jointype === "JOIN_LEFT" ? "LEFT" : n.jointype === "JOIN_RIGHT" ? "RIGHT" : n.jointype === "JOIN_FULL" ? "FULL" : "INNER";
    const l = this.from(n.larg);
    const r = this.from(n.rarg);
    if (n.isNatural) return `(${l} NATURAL ${kind} JOIN ${r})`;
    if (n.usingClause) return `(${l} ${kind} JOIN ${r} USING (${this.names(n.usingClause).join(", ")}))`;
    if (n.quals) return `(${l} ${kind} JOIN ${r} ON ${this.expr(n.quals)})`;
    return `(${l} CROSS JOIN ${r})`;
  }

  exprs(list: Json[]): string {
    return list.map((e) => this.expr(e)).join(", ");
  }

  expr(node: Json): string {
    const [k, n] = unwrap(node);
    switch (k) {
      case "ColumnRef": {
        const f = this.names(n.fields);
        // our parser keeps the last two parts (parser/expr.ts `ColRefOf`, `star`)
        return f.length >= 2 ? `${f.at(-2)}.${f.at(-1)}` : f[0]!;
      }
      case "A_Const":
        return this.constant(n);
      case "ParamRef":
        return `$${n.number}`;
      case "SetToDefault":
        return "DEFAULT";
      case "TypeCast":
        return `(${this.expr(n.arg)}::${this.typeName(n.typeName)})`;
      case "A_Expr":
        return this.aExpr(n);
      case "BoolExpr": {
        if (n.boolop === "NOT_EXPR") return `(NOT ${this.expr(n.args[0])})`;
        const op = n.boolop === "AND_EXPR" ? "AND" : "OR";
        return `(${this.flatten(n.boolop, n.args).map((a) => this.expr(a)).join(` ${op} `)})`;
      }
      case "NullTest":
        return `(${this.expr(n.arg)} IS ${n.nulltesttype === "IS_NOT_NULL" ? "NOT " : ""}NULL)`;
      case "BooleanTest": {
        const [not, what] = BOOL_TESTS[n.booltesttype as string] ?? [false, "?"];
        return `(${this.expr(n.arg)} IS ${not ? "NOT " : ""}${what})`;
      }
      case "FuncCall":
        return this.call(n);
      case "SQLValueFunction":
        return `${SQL_VALUE_FUNCTIONS[n.op as string] ?? "?"}()`;
      case "CoalesceExpr":
        return `coalesce(${this.exprs(n.args)})`;
      case "MinMaxExpr":
        return `${n.op === "IS_GREATEST" ? "greatest" : "least"}(${this.exprs(n.args)})`;
      case "GroupingFunc":
        return `grouping(${this.exprs(n.args)})`;
      case "MergeSupportFunc":
        return "merge_action()";
      case "CaseExpr": {
        let s = "CASE";
        if (n.arg) s += ` ${this.expr(n.arg)}`;
        for (const w of n.args as Json[]) {
          const c = unwrap(w)[1];
          s += ` WHEN ${this.expr(c.expr)} THEN ${this.expr(c.result)}`;
        }
        if (n.defresult) s += ` ELSE ${this.expr(n.defresult)}`;
        return `${s} END`;
      }
      case "SubLink":
        return this.subLink(n);
      case "A_ArrayExpr":
        return `ARRAY[${this.exprs(n.elements ?? [])}]`;
      case "RowExpr":
        return `ROW(${this.exprs(n.args ?? [])})`;
      case "A_Indirection":
        return this.indirect(this.expr(n.arg), n.indirection);
      case "CollateClause":
        return `(${this.expr(n.arg)} COLLATE ${this.names(n.collname).at(-1)})`;
      case "NamedArgExpr":
        return `${n.name} => ${this.expr(n.arg)}`;
      case "SortBy":
        // ASC / DESC / USING op and NULLS FIRST / LAST are discarded by our parser (expr.ts `SkipOrderTail`)
        return this.expr(n.node);
      case "XmlExpr":
      case "XmlSerialize":
        return `XML(${OUT})`;
      case "JsonIsPredicate":
        return `(${this.expr(n.expr)} IS JSON)`;
      case "JsonParseExpr":
      case "JsonScalarExpr":
      case "JsonSerializeExpr":
      case "JsonObjectConstructor":
      case "JsonArrayConstructor":
      case "JsonArrayQueryConstructor":
      case "JsonFuncExpr":
      case "JsonObjectAgg":
      case "JsonArrayAgg":
        return `JSON(${OUT})`;
      default:
        return `?${k}`;
    }
  }

  /** Our parser builds a balanced AND / OR tree (expr.ts `ParseChain`), Postgres a left-flattened one. */
  private flatten(op: string, args: Json[]): Json[] {
    return args.flatMap((a) => {
      const [k, n] = unwrap(a);
      return k === "BoolExpr" && n.boolop === op ? this.flatten(op, n.args) : [a];
    });
  }

  private indirect(base: string, list: Json[]): string {
    let s = base;
    for (const x of list) {
      const [k, n] = unwrap(x);
      if (k === "A_Indices") s = n.is_slice ? `${s}[${n.lidx ? this.expr(n.lidx) : ""}:${n.uidx ? this.expr(n.uidx) : ""}]` : `${s}[${this.expr(n.uidx)}]`;
      else if (k === "String") s = `(${s}).${n.sval}`;
      else if (k === "A_Star") s = `(${s}).*`;
      else s = `${s}?${k}`;
    }
    return s;
  }

  private constant(n: Json): string {
    if (n.isnull) return "NULL";
    if (n.boolval) return n.boolval.boolval ? "true" : "false";
    if (n.ival || n.fval) return this.number(n);
    if (n.sval) return `'${this.stringValue(n.sval.sval ?? "", n.location)}'`;
    // B'…' / X'…': our lexer keeps the digits without the prefix
    if (n.bsval) return `'${String(n.bsval.bsval ?? "").slice(1)}'`;
    return "?const";
  }

  /**
   * Postgres folds a unary minus into the constant (gram.y `doNegate`), our parser keeps `-` as
   * an operator: the minus signs before the literal are put back as `(- …)`.
   */
  private number(n: Json): string {
    const value = n.ival ? String(n.ival.ival ?? 0) : String(n.fval.fval);
    const text = this.at(n.location, 1 << 16);
    if (!text) return value; // made by the grammar (FETCH FIRST ROW ONLY, …)
    let i = 0;
    let minus = 0;
    for (;;) {
      const ws = /^(?:\s+|--[^\n]*\n?|\/\*[\s\S]*?\*\/|\()*/.exec(text.slice(i))![0];
      i += ws.length;
      if (text[i] === "-") {
        minus++;
        i++;
        continue;
      }
      break;
    }
    const tok = /^(?:0[xX][0-9a-fA-F_]+|0[oO][0-7_]+|0[bB][01_]+|(?:\d[\d_]*(?:\.[\d_]*)?|\.\d[\d_]*)(?:[eE][+-]?\d[\d_]*)?)/.exec(text.slice(i))?.[0] ?? value;
    let s = tok;
    for (let k = 0; k < minus; k++) s = `(- ${s})`;
    return s;
  }

  /**
   * Our lexer keeps E'' and U&'' escapes raw (lexer/tokens.ts); Postgres gives the decoded value,
   * so their raw text is read back from the source.
   */
  private stringValue(value: string, loc: number | undefined): string {
    const text = this.at(loc, 1 << 20);
    const m = /^(?:[eE]|[uU]&)'/.exec(text);
    if (!m) return value;
    const escapes = m[0].length === 2;
    let out = "";
    let i = m[0].length;
    for (;;) {
      if (i >= text.length) return value;
      const c = text[i]!;
      if (escapes && c === "\\") {
        out += text.slice(i, i + 2);
        i += 2;
        continue;
      }
      if (c === "'") {
        if (text[i + 1] === "'") {
          out += "'";
          i += 2;
          continue;
        }
        break;
      }
      out += c;
      i++;
    }
    // adjacent literals separated by a newline continue the string; then the decoded value is used
    const rest = text.slice(i + 1);
    return /^[ \t\r\f]*\n\s*'/.test(rest) ? value : out;
  }

  private aExpr(n: Json): string {
    const name = this.names(n.name);
    const op = name.at(-1)!;
    switch (n.kind) {
      case "AEXPR_OP": {
        // `OPERATOR(schema.op)`: our parser keeps the operator as "operator" (expr.ts `ParseOperatorSyntax`)
        const o = name.length > 1 || /^operator\s*\(/i.test(this.at(n.location, 16)) ? "operator" : op;
        return n.lexpr ? `(${this.expr(n.lexpr)} ${o} ${this.expr(n.rexpr)})` : `(${o} ${this.expr(n.rexpr)})`;
      }
      case "AEXPR_OP_ANY":
      case "AEXPR_OP_ALL":
        return `(${this.expr(n.lexpr)} ${op} ${n.kind === "AEXPR_OP_ANY" ? "ANY" : "ALL"} (${this.expr(n.rexpr)}))`;
      case "AEXPR_DISTINCT":
        return `(${this.expr(n.lexpr)} IS DISTINCT FROM ${this.expr(n.rexpr)})`;
      case "AEXPR_NOT_DISTINCT":
        return `(${this.expr(n.lexpr)} IS NOT DISTINCT FROM ${this.expr(n.rexpr)})`;
      case "AEXPR_NULLIF":
        return `nullif(${this.expr(n.lexpr)}, ${this.expr(n.rexpr)})`;
      case "AEXPR_IN":
        return `(${this.expr(n.lexpr)} ${op === "<>" ? "NOT IN" : "IN"} (${this.exprs(unwrap(n.rexpr)[1].items ?? [])}))`;
      case "AEXPR_LIKE":
        return `(${this.expr(n.lexpr)} ${op === "!~~" ? "NOT LIKE" : "LIKE"} ${this.expr(this.unescape(n.rexpr, "like_escape"))})`;
      case "AEXPR_ILIKE":
        return `(${this.expr(n.lexpr)} ${op === "!~~*" ? "NOT ILIKE" : "ILIKE"} ${this.expr(this.unescape(n.rexpr, "like_escape"))})`;
      case "AEXPR_SIMILAR":
        return `(${this.expr(n.lexpr)} ${op === "!~" ? "NOT SIMILAR TO" : "SIMILAR TO"} ${this.expr(this.unescape(n.rexpr, "similar_to_escape"))})`;
      case "AEXPR_BETWEEN":
      case "AEXPR_NOT_BETWEEN":
      case "AEXPR_BETWEEN_SYM":
      case "AEXPR_NOT_BETWEEN_SYM": {
        // SYMMETRIC / ASYMMETRIC are skipped by our parser (expr.ts `ParseBetween`)
        const [lo, hi] = unwrap(n.rexpr)[1].items as Json[];
        return `(${this.expr(n.lexpr)} ${n.kind.includes("NOT") ? "NOT BETWEEN" : "BETWEEN"} ${this.expr(lo!)} AND ${this.expr(hi!)})`;
      }
      default:
        return `?${n.kind}`;
    }
  }

  /**
   * `p ESCAPE e` / `SIMILAR TO p`: the grammar wraps the pattern in `pg_catalog.like_escape` /
   * `similar_to_escape`; our parser keeps the pattern and drops the escape (expr.ts `ParseLike`).
   */
  private unescape(node: Json, fn: string): Json {
    const [k, n] = unwrap(node);
    if (k !== "FuncCall") return node;
    const name = this.names(n.funcname);
    return name.length === 2 && name[0] === "pg_catalog" && name[1] === fn ? n.args[0] : node;
  }

  private call(n: Json): string {
    const name = this.names(n.funcname).at(-1)!;
    const args = (n.args ?? []) as Json[];
    // `OVERLAY(e PLACING p FROM a [FOR b])`: our AST keeps the first operand only (ast.ts `Overlay`)
    if (name === "overlay" && n.funcformat === "COERCE_SQL_SYNTAX") return `overlay(${this.expr(args[0]!)}, ${OUT})`;
    // `SUBSTRING(e FOR n)`: the grammar passes `1` and `n::int4` (gram.y `substr_list`); our AST keeps `n`
    if (name === "substring" && n.funcformat === "COERCE_SQL_SYNTAX" && args.length === 3) {
      const [fk, f] = unwrap(args[1]!);
      const [tk, t] = unwrap(args[2]!);
      if (fk === "A_Const" && !(f.location >= 0) && tk === "TypeCast" && !(t.location >= 0)) return `substring(${this.expr(args[0]!)}, 1, ${this.expr(t.arg)})`;
    }
    let list: string;
    if (n.agg_star) list = "*";
    else {
      const parts = args.map((a) => this.expr(a));
      if (n.func_variadic && parts.length) parts[parts.length - 1] = `VARIADIC ${parts.at(-1)}`;
      list = (n.agg_distinct ? "DISTINCT " : "") + parts.join(", ");
    }
    let s = `${name}(${list})`;
    // ORDER BY inside the call is discarded by our parser (expr.ts `SkipAggOrderBy`); WITHIN GROUP's keys are kept
    if (n.agg_within_group) {
      const keys = n.agg_order as Json[];
      s += ` WITHIN GROUP (${keys.length === 1 ? this.expr(keys[0]!) : `ROW(${this.exprs(keys)})`})`;
    }
    if (n.agg_filter) s += ` FILTER (WHERE ${this.expr(n.agg_filter)})`;
    if (n.over) s += ` OVER ${this.windowSpec(n.over)}`;
    return s;
  }

  /**
   * `OVER w` and `OVER (w …)` both keep the name (expr.ts `ParseOver`); the frame clause and sort
   * directions are discarded (`SkipFrame`, `SkipOrderTail`).
   */
  private windowSpec(w: Json, clause = false): string {
    const parts: string[] = [];
    // in a WINDOW clause `name` is the window being defined; in OVER it is `OVER name`
    const base = w.refname ?? (clause ? undefined : w.name);
    if (base !== undefined) parts.push(base);
    if (w.partitionClause?.length) parts.push(`PARTITION BY ${this.exprs(w.partitionClause)}`);
    if (w.orderClause?.length) parts.push(`ORDER BY ${this.exprs(w.orderClause)}`);
    return `(${parts.join(" ")})`;
  }

  private subLink(n: Json): string {
    const q = this.selectNode(n.subselect);
    switch (n.subLinkType) {
      case "EXISTS_SUBLINK":
        return `EXISTS(${q})`;
      case "ARRAY_SUBLINK":
        return `ARRAY(${q})`;
      case "EXPR_SUBLINK":
        return `(${q})`;
      case "ANY_SUBLINK":
      case "ALL_SUBLINK": {
        const t = this.expr(n.testexpr);
        if (!n.operName) return `(${t} IN (${q}))`;
        return `(${t} ${this.names(n.operName).at(-1)} ${n.subLinkType === "ANY_SUBLINK" ? "ANY" : "ALL"} (${q}))`;
      }
      default:
        return `?${n.subLinkType}`;
    }
  }

  /** As parser/typename.ts canonicalizes it: last name part, aliases, `[]`, no modifiers. */
  typeName(t: Json): string {
    const parts = this.names(t.names);
    let name = parts.at(-1)!;
    if (parts.length === 1 && TYPE_ALIASES[name] !== undefined) name = TYPE_ALIASES[name]!;
    if (t.pct_type) name += "%type";
    return t.arrayBounds?.length ? `${name}[]` : name;
  }
}

/** Our parser reads ALTER TABLE / VIEW / MATERIALIZED VIEW all as ALTER TABLE. */
const RELATIONS: ReadonlySet<string> = new Set(["OBJECT_TABLE", "OBJECT_VIEW", "OBJECT_MATVIEW"]);

const ROLE_SPECS: { readonly [k: string]: string } = { ROLESPEC_CURRENT_ROLE: "current_role", ROLESPEC_CURRENT_USER: "current_user", ROLESPEC_SESSION_USER: "session_user" };

const BOOL_TESTS: { readonly [k: string]: readonly [boolean, string] } = {
  IS_TRUE: [false, "TRUE"], IS_NOT_TRUE: [true, "TRUE"],
  IS_FALSE: [false, "FALSE"], IS_NOT_FALSE: [true, "FALSE"],
  IS_UNKNOWN: [false, "UNKNOWN"], IS_NOT_UNKNOWN: [true, "UNKNOWN"],
};

/** `current_date`, `localtimestamp(3)`, …: our parser makes them zero-argument calls (expr.ts `SpecialValue`). */
const SQL_VALUE_FUNCTIONS: { readonly [k: string]: string } = {
  SVFOP_CURRENT_DATE: "current_date",
  SVFOP_CURRENT_TIME: "current_time", SVFOP_CURRENT_TIME_N: "current_time",
  SVFOP_CURRENT_TIMESTAMP: "current_timestamp", SVFOP_CURRENT_TIMESTAMP_N: "current_timestamp",
  SVFOP_LOCALTIME: "localtime", SVFOP_LOCALTIME_N: "localtime",
  SVFOP_LOCALTIMESTAMP: "localtimestamp", SVFOP_LOCALTIMESTAMP_N: "localtimestamp",
  SVFOP_CURRENT_ROLE: "current_role", SVFOP_CURRENT_USER: "current_user", SVFOP_USER: "user",
  SVFOP_SESSION_USER: "session_user", SVFOP_CURRENT_CATALOG: "current_catalog", SVFOP_CURRENT_SCHEMA: "current_schema",
};

export function pgCanon(stmt: Json, sql: string): string {
  return new PgCanon(sql).stmt(stmt);
}
