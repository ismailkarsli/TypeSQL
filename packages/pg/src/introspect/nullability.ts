export type QueryFn = (
	text: string,
	values?: unknown[],
) => Promise<{ readonly rows: readonly any[] }>;

export interface NullabilityOptions {
	readonly notNull?: (view: string, column: string) => boolean;
}

export interface Node {
	readonly _: string;
	readonly [field: string]: NodeValue;
}
export type NodeValue = Node | readonly NodeValue[] | string | null;

type Token = string | { readonly str: string };

function tokenize(s: string): Token[] {
	const out: Token[] = [];
	let i = 0;
	while (i < s.length) {
		const c = s[i]!;
		if (c === " " || c === "\n" || c === "\t") {
			i++;
			continue;
		}
		if (c === "(" || c === ")" || c === "{" || c === "}") {
			out.push(c);
			i++;
			continue;
		}
		if (c === "[") {
			i = s.indexOf("]", i) + 1;
			continue;
		}
		if (c === '"') {
			let v = "";
			i++;
			while (i < s.length && s[i] !== '"') {
				if (s[i] === "\\") i++;
				v += s[i++];
			}
			i++;
			out.push({ str: v });
			continue;
		}
		let v = "";
		while (i < s.length && !" \n\t(){}".includes(s[i]!)) {
			if (s[i] === "\\") i++;
			v += s[i++];
		}
		out.push(v);
	}
	return out;
}

export function parseNodeTree(text: string): NodeValue {
	const toks = tokenize(text);
	let p = 0;
	const isLabel = (t: Token | undefined): boolean =>
		typeof t === "string" && t.startsWith(":");
	const value = (): NodeValue => {
		const t = toks[p++];
		if (t === "{") {
			const node: Record<string, NodeValue> = { _: toks[p++] as string };
			while (p < toks.length && toks[p] !== "}") {
				const label = toks[p++];
				if (!isLabel(label)) continue;
				if (toks[p] === "}" || isLabel(toks[p])) {
					node[(label as string).slice(1)] = null;
					continue;
				}
				node[(label as string).slice(1)] = value();
			}
			p++;
			return node as Node;
		}
		if (t === "(") {
			const list: NodeValue[] = [];
			while (p < toks.length && toks[p] !== ")") list.push(value());
			p++;
			return list;
		}
		if (t === undefined || t === "<>") return null;
		return typeof t === "object" ? t.str : t;
	};
	return value();
}

const list = (x: NodeValue | undefined): readonly NodeValue[] =>
	Array.isArray(x) ? x : [];
const node = (x: NodeValue | undefined): Node | null =>
	x !== null && typeof x === "object" && !Array.isArray(x) ? (x as Node) : null;
const str = (x: NodeValue | undefined): string | null =>
	typeof x === "string" ? x : null;

const NON_NULL_FUNCTIONS = new Set([
	"current_database",
	"current_user",
	"session_user",
	"current_schema",
	"pg_get_userbyid",
	"pg_my_temp_schema",
	"nameconcatoid",
	"pg_has_role",
	"has_table_privilege",
	"has_column_privilege",
	"has_any_column_privilege",
	"has_function_privilege",
	"has_schema_privilege",
	"has_sequence_privilege",
	"has_type_privilege",
	"pg_relation_is_updatable",
	"pg_column_is_updatable",
	"pg_is_other_temp_schema",
	"now",
	"statement_timestamp",
	"transaction_timestamp",
	"clock_timestamp",
	"lower",
	"upper",
	"length",
	"char_length",
	"octet_length",
	"concat",
	"concat_ws",
	"md5",
	"btrim",
	"ltrim",
	"rtrim",
	"abs",
	"round",
	"trunc",
	"floor",
	"ceil",
	"ceiling",
	"date_trunc",
	"age",
]);

const NULLABLE_STAT_FUNCTIONS = new Set([
	"pg_stat_get_db_checksum_failures",
	"pg_stat_get_backend_pid",
	"pg_stat_get_backend_dbid",
	"pg_stat_get_backend_userid",
]);
const isNonNullStatFunction = (name: string, ret: string): boolean =>
	name.startsWith("pg_stat_get_") &&
	(ret === "int8" || ret === "int4" || ret === "float8") &&
	!NULLABLE_STAT_FUNCTIONS.has(name);

const NON_NULL_AGGREGATES = new Set(["count"]);
const NON_NULL_WINDOW_FUNCTIONS = new Set([
	"count",
	"row_number",
	"rank",
	"dense_rank",
	"percent_rank",
	"cume_dist",
]);

const NON_NULL_SRF_COLUMNS: Readonly<Record<string, readonly number[]>> = {
	generate_series: [1],
	generate_subscripts: [1],
	jsonb_each: [1, 2],
	json_each: [1, 2],
	jsonb_each_text: [1],
	json_each_text: [1],
	jsonb_object_keys: [1],
	json_object_keys: [1],
	jsonb_array_elements: [1],
	json_array_elements: [1],
	regexp_matches: [1],
	regexp_split_to_table: [1],
};

const NULLABLE_OPERATORS = new Set(["->", "->>", "#>", "#>>", "@@", "@?"]);

interface Proc {
	readonly name: string;
	readonly ret: string;
	readonly system: boolean;
}
interface Att {
	readonly attnum: number;
	readonly notnull: boolean;
	readonly relkind: string;
}

export class ViewNullability {
	private readonly query: QueryFn;
	private readonly options: NullabilityOptions;
	private readonly analyzing = new Set<string>();

	constructor(query: QueryFn, options: NullabilityOptions = {}) {
		this.query = query;
		this.options = options;
	}

	notNull(relid: string | number): Promise<boolean[]> {
		const key = String(relid);
		if (this.analyzing.has(key)) return Promise.resolve([]);
		this.analyzing.add(key);
		return this.analyze(key).finally(() => this.analyzing.delete(key));
	}

	private async analyze(relid: string): Promise<boolean[]> {
		const { rows } = await this.query(
			`SELECT r.ev_action, c.relname FROM pg_rewrite r JOIN pg_class c ON c.oid = r.ev_class
        WHERE r.ev_class = $1 AND r.rulename = '_RETURN'`,
			[relid],
		);
		const row = rows[0] as { ev_action: string; relname: string } | undefined;
		if (!row) return [];
		const query = node(list(parseNodeTree(row.ev_action))[0]);
		if (!query) return [];
		const out: boolean[] = [];
		for (const te of list(query["targetList"])) {
			const entry = node(te);
			if (!entry || entry["resjunk"] === "true") continue;
			const name = str(entry["resname"]) ?? "";
			// A set operation's targets refer to its first branch only; check all.
			const notNull = query["setOperations"]
				? await this.queryColumn(query, out.length + 1)
				: await this.expr(entry["expr"], query);
			out.push(notNull || (this.options.notNull?.(row.relname, name) ?? false));
		}
		return out;
	}

	private async proc(oid: string): Promise<Proc | undefined> {
		const { rows } = await this.query(
			`SELECT p.proname AS name, t.typname AS ret, p.pronamespace = 'pg_catalog'::regnamespace AS system
    FROM pg_proc p JOIN pg_type t ON t.oid = p.prorettype WHERE p.oid = $1`,
			[oid],
		);
		return rows[0] as Proc | undefined;
	}

	private async strictOperator(e: Node): Promise<boolean> {
		const { rows } = await this.query(
			`SELECT o.oprname AS name, o.oprnamespace = 'pg_catalog'::regnamespace AS system
    FROM pg_operator o WHERE o.oid = $1`,
			[String(e["opno"])],
		);
		const op = rows[0] as Pick<Proc, "name" | "system"> | undefined;
		return op?.system === true && !NULLABLE_OPERATORS.has(op.name);
	}

	private columns(relid: string): Promise<Att[]> {
		return this.query(
			`SELECT a.attnum, c.relkind,
                a.attnotnull OR coalesce((
                  WITH RECURSIVE chain(oid, nn) AS (
                    SELECT t.oid, t.typnotnull FROM pg_type t WHERE t.oid = a.atttypid AND t.typtype = 'd'
                    UNION ALL
                    SELECT b.oid, b.typnotnull FROM chain JOIN pg_type d ON d.oid = chain.oid
                      JOIN pg_type b ON b.oid = d.typbasetype AND b.typtype = 'd')
                  SELECT bool_or(nn) FROM chain), false) AS notnull
           FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
          WHERE a.attrelid = $1 AND a.attnum > 0 AND NOT a.attisdropped`,
			[relid],
		).then(({ rows }) => rows as Att[]);
	}

	private async queryColumn(
		value: NodeValue | undefined,
		attno: number,
	): Promise<boolean> {
		const query = node(value);
		if (!query) return false;
		if (query["setOperations"]) {
			for (const r of list(query["rtable"]))
				if (!(await this.queryColumn(node(r)?.subquery, attno))) return false;
			return true;
		}
		const entries = list(query["targetList"])
			.map(node)
			.filter((t): t is Node => t !== null && t["resjunk"] !== "true");
		const te = entries[attno - 1];
		return te ? this.expr(te["expr"], query) : false;
	}

	private async variable(v: Node, query: Node): Promise<boolean> {
		if (!("varnullingrels" in v) || v["varlevelsup"] !== "0") return false;
		if (list(v["varnullingrels"]).length > 1) return false;
		if (list(query["groupingSets"]).length > 0) return false;
		const rte = node(list(query["rtable"])[Number(v["varno"]) - 1]);
		const attno = Number(v["varattno"]);
		if (!rte || !(attno > 0)) return false;
		switch (rte["rtekind"]) {
			case "0": {
				const relid = str(rte["relid"])!;
				const att = (await this.columns(relid)).find((a) => a.attnum === attno);
				if (!att) return false;
				if (att.relkind === "v" || att.relkind === "m")
					return (await this.notNull(relid))[attno - 1] ?? false;
				return att.notnull;
			}
			case "1":
				return this.queryColumn(rte["subquery"], attno);
			case "2":
				return this.expr(list(rte["joinaliasvars"])[attno - 1], query);
			case "3":
				return this.functionColumn(rte, attno);
			case "9":
				return this.expr(list(rte["groupexprs"])[attno - 1], query);
		}
		return false;
	}

	private async functionColumn(rte: Node, attno: number): Promise<boolean> {
		const functions = list(rte["functions"]);
		const only = node(functions[0]);
		if (functions.length !== 1 || !only) return false;
		const count = Number(str(only["funccolcount"]));
		if (rte["funcordinality"] === "true" && attno === count + 1) return true;
		const call = node(only["funcexpr"]);
		if (call?._ !== "FUNCEXPR") return false;
		const proc = await this.proc(String(call["funcid"]));
		return (
			proc?.system === true &&
			(NON_NULL_SRF_COLUMNS[proc.name]?.includes(attno) ?? false)
		);
	}

	private async all(
		args: NodeValue | undefined,
		query: Node,
	): Promise<boolean> {
		for (const a of list(args)) if (!(await this.expr(a, query))) return false;
		return true;
	}

	private async expr(
		value: NodeValue | undefined,
		query: Node,
	): Promise<boolean> {
		const e = node(value);
		if (!e) return false;
		switch (e._) {
			case "VAR":
				return this.variable(e, query);
			case "CONST":
				return e["constisnull"] === "false";
			case "RELABELTYPE":
			case "COERCEVIAIO":
			case "COERCETODOMAIN":
			case "ARRAYCOERCEEXPR":
			case "COLLATEEXPR":
				return this.expr(e["arg"], query);
			case "FUNCEXPR": {
				if (e["funcretset"] !== "false") return false;
				const proc = await this.proc(String(e["funcid"]));
				if (proc?.system && proc.name === "format_type")
					return this.expr(list(e["args"])[0], query);
				const castLike = e["funcformat"] === "1" || e["funcformat"] === "2";
				const known =
					proc?.system === true &&
					(NON_NULL_FUNCTIONS.has(proc.name) ||
						isNonNullStatFunction(proc.name, proc.ret));
				return (castLike || known) && this.all(e["args"], query);
			}
			case "BOOLEXPR":
				return this.all(e["args"], query);
			case "OPEXPR":
				return (await this.strictOperator(e)) && this.all(e["args"], query);
			case "SCALARARRAYOPEXPR": {
				const [left, right] = list(e["args"]);
				const array = node(right);
				return (
					(await this.strictOperator(e)) &&
					array?._ === "ARRAYEXPR" &&
					(await this.expr(left, query)) &&
					this.all(array["elements"], query)
				);
			}
			case "DISTINCTEXPR":
			case "NULLTEST":
			case "BOOLEANTEST":
			case "ARRAYEXPR":
			case "ROWEXPR":
				return true;
			case "COALESCEEXPR":
			case "MINMAXEXPR":
				for (const a of list(e["args"]))
					if (await this.expr(a, query)) return true;
				return false;
			case "CASEEXPR":
				for (const w of list(e["args"]))
					if (!(await this.expr(node(w)?.["result"], query))) return false;
				return this.expr(e["defresult"], query);
			case "SUBLINK":
				return e["subLinkType"] === "0" || e["subLinkType"] === "6";
			case "AGGREF": {
				const proc = await this.proc(String(e["aggfnoid"]));
				return proc?.system === true && NON_NULL_AGGREGATES.has(proc.name);
			}
			case "WINDOWFUNC": {
				const proc = await this.proc(String(e["winfnoid"]));
				return (
					proc?.system === true && NON_NULL_WINDOW_FUNCTIONS.has(proc.name)
				);
			}
		}
		return false;
	}
}
