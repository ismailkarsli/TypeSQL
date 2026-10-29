const CALL = /[A-Za-z_$][\w$]*(?:<[^()]*>)?\(\s*(["'`])/g;
const WINDOW = 20_000;

export function mayBeInSqlLiteral(text: string, offset: number): boolean {
	const window = text.slice(Math.max(0, offset - WINDOW), offset);
	let open = false;
	for (const m of window.matchAll(CALL))
		open = !closes(window, m.index + m[0].length, m[1]!);
	return open;
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
