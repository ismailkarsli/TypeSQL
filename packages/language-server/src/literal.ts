/**
 * A cheap test, on the editor's text, of whether the cursor may be inside a string literal that is
 * the first argument of a call (`sql("…`, `` tx(`… ``, `sql.as<Row>("…`). It runs on every
 * completion request, before the language server is asked anything; a false positive costs one
 * lookup, a false negative (a literal containing `f("…")` before the cursor) a missed list.
 */

/** A call's name, type arguments, `(` and the opening quote of its first argument. */
const CALL = /[A-Za-z_$][\w$]*(?:<[^()]*>)?\(\s*(["'`])/g;
/** How far back to look for the call. */
const WINDOW = 20_000;

export function mayBeInSqlLiteral(text: string, offset: number): boolean {
	const window = text.slice(Math.max(0, offset - WINDOW), offset);
	let open = false;
	for (const m of window.matchAll(CALL))
		open = !closes(window, m.index + m[0].length, m[1]!);
	return open;
}

/** Whether the literal opened with `quote` before `from` ends before the end of `s`. */
function closes(s: string, from: number, quote: string): boolean {
	for (let i = from; i < s.length; i++) {
		const c = s[i];
		if (c === "\\") i++;
		else if (c === quote || (quote !== "`" && c === "\n")) return true;
	}
	return false;
}
