import type { Sig } from "../../src/index.js";

declare module "../../src/index.js" {
	interface FunctionCatalog {
		aug_len: Sig<["text"], "int8">;
		aug_sum: Sig<["anynumeric"], "numeric", { agg: true }>;
		aug_series: Sig<["int4"], "text", { srf: true }>;
		aug_over: [Sig<["int4"], "int4">, Sig<["text"], "text">];
		aug_nn: Sig<["any"], "bool", { nullable: false }>;
		aug_first: Sig<["text", "text"], "text", { strict: [1] }>;
		aug_win: Sig<["any"], "$1", { window: true; nullable: true }>;
		aug_arr: Sig<["anyarray"], "$elem1">;
	}
}
