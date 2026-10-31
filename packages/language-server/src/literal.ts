// A call whose first argument is a string, optionally after comments such as
// the `/* sql */` marker.
const CALL =
	/[A-Za-z_$][\w$]*(?:<[^()]*>)?\(\s*(?:\/\*[\s\S]*?\*\/\s*)*(["'`])/g;
const WINDOW = 20_000;

/**
 * A cheap pre-filter: is `offset` inside a string that opens a call's first
 * argument? Any such string still open counts, so a call nested in a template
 * literal's `${…}` (`${sql.param("x")}`) doesn't hide the template around it.
 */
export function mayBeInSqlLiteral(text: string, offset: number): boolean {
	const window = text.slice(Math.max(0, offset - WINDOW), offset);
	for (const m of window.matchAll(CALL))
		if (!closes(window, m.index + m[0].length, m[1]!)) return true;
	return false;
}

function closes(s: string, from: number, quote: string): boolean {
	let escaped = false;
	for (const c of s.slice(from)) {
		if (escaped) escaped = false;
		else if (c === "\\") escaped = true;
		else if (c === quote || (quote !== "`" && c === "\n")) return true;
	}
	return false;
}
