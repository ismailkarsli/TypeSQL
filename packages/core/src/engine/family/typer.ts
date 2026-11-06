// Typer leaves shared by the MySQL and SQLite engines.
import type { ColInfo } from "../types.js";

/** Whether one of the types can be `NULL`. */
export type AnyNull<L extends readonly ColInfo[]> =
	true extends L[number]["nullable"] ? true : false;

/** Whether every one of the types can be `NULL`. */
export type AllNull<L extends readonly ColInfo[]> =
	false extends L[number]["nullable"] ? false : true;

/** Whether the digits of a number literal, up to its exponent, include a nonzero one. */
export type NonZeroDigits<V extends string> = V extends `${infer H}${infer R}`
	? H extends "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9"
		? true
		: H extends "e" | "E"
			? false
			: NonZeroDigits<R>
	: false;
