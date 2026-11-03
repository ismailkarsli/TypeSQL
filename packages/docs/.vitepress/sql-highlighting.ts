import { readFileSync } from "node:fs";
import type { MarkdownOptions } from "vitepress";

// Color SQL inside code examples the way the VS Code extension does: its injection
// grammar marks the SQL in sql(…) and similar strings, and its default colors
// paint it. Both are read from packages/vscode, so the docs follow the editor.

const vscode = new URL("../../vscode/", import.meta.url);
const grammar = JSON.parse(
	readFileSync(
		new URL("syntaxes/sql-injection.tmLanguage.json", vscode),
		"utf8",
	),
);
const manifest = JSON.parse(
	readFileSync(new URL("package.json", vscode), "utf8"),
);
const colors =
	manifest.contributes.configurationDefaults["editor.tokenColorCustomizations"];

// VitePress's default code themes, and the extension's rules for each.
const themes = {
	"github-light": colors["[*Light*]"].textMateRules,
	"github-dark": colors["[*Dark*][Default High Contrast]"].textMateRules,
};

export const sqlHighlighting: MarkdownOptions = {
	async shikiSetup(shiki) {
		// One call: the injection only takes when it is loaded together with the
		// languages it injects into and the SQL it embeds, before any of them is used.
		await shiki.loadLanguage("typescript", "tsx", "javascript", "jsx", "sql", {
			...grammar,
			name: "typesql-inline",
			embeddedLangs: ["sql"],
			injectTo: ["source.ts", "source.tsx", "source.js", "source.js.jsx"],
		});
		for (const [name, rules] of Object.entries(themes)) {
			const theme = shiki.getTheme(name);
			// Reloading a theme under its own name replaces it; the rules come last so they win.
			await shiki.loadTheme({
				...theme,
				settings: [...theme.settings, ...rules],
			});
		}
	},
};
