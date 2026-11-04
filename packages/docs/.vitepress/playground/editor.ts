import { javascript } from "@codemirror/lang-javascript";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import {
	type Diagnostic as EditorDiagnostic,
	lintGutter,
	setDiagnostics,
} from "@codemirror/lint";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import wasmUrl from "@tsrs/wasm/tsrs.wasm?url";
import { basicSetup } from "codemirror";
import lz from "lz-string";
import example from "../../playground/core.ts?raw";
import type { FromWorker, PlaygroundDiagnostic, ToWorker } from "./protocol.ts";
import CheckerWorker from "./worker.ts?worker";

export interface PlaygroundState {
	status: "loading" | "checking" | "checked" | "failed";
	failure?: string;
	diagnostics: PlaygroundDiagnostic[];
	milliseconds?: number;
	versions?: { typesql: string; typescript: string; tsrs: string };
}

export interface Playground {
	reveal(diagnostic: PlaygroundDiagnostic): void;
	reset(): void;
	/** The link to the current code. */
	link(): string;
	dispose(): void;
}

const prefix = "#code/";

function linkedCode(): string | undefined {
	if (!location.hash.startsWith(prefix)) return undefined;
	return (
		lz.decompressFromEncodedURIComponent(location.hash.slice(prefix.length)) ||
		undefined
	);
}

const highlighting = HighlightStyle.define([
	{
		tag: [tags.keyword, tags.controlKeyword, tags.moduleKeyword],
		color: "var(--typesql-playground-keyword)",
	},
	{
		tag: [tags.string, tags.special(tags.string)],
		color: "var(--typesql-playground-string)",
	},
	{
		tag: [tags.number, tags.bool, tags.null],
		color: "var(--typesql-playground-literal)",
	},
	{
		tag: [tags.typeName, tags.className, tags.namespace],
		color: "var(--typesql-playground-type)",
	},
	{
		tag: [tags.function(tags.variableName), tags.function(tags.propertyName)],
		color: "var(--typesql-playground-function)",
	},
	{
		tag: [tags.propertyName, tags.definition(tags.propertyName)],
		color: "var(--typesql-playground-property)",
	},
	{
		tag: [tags.comment, tags.lineComment, tags.blockComment],
		color: "var(--typesql-playground-comment)",
		fontStyle: "italic",
	},
]);

const theme = EditorView.theme({
	"&": {
		height: "100%",
		fontSize: "14px",
		color: "var(--vp-c-text-1)",
		backgroundColor: "var(--vp-c-bg)",
	},
	".cm-scroller": {
		fontFamily: "var(--vp-font-family-mono)",
		lineHeight: "1.6",
	},
	".cm-content": { caretColor: "var(--vp-c-brand-1)" },
	".cm-cursor": { borderLeftColor: "var(--vp-c-brand-1)" },
	".cm-gutters": {
		color: "var(--vp-c-text-3)",
		backgroundColor: "var(--vp-c-bg)",
		borderRight: "1px solid var(--vp-c-divider)",
	},
	".cm-activeLine, .cm-activeLineGutter": {
		backgroundColor: "var(--vp-c-default-soft)",
	},
	"&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection":
		{ backgroundColor: "var(--vp-c-brand-soft)" },
	".cm-tooltip": {
		color: "var(--vp-c-text-1)",
		backgroundColor: "var(--vp-c-bg-elv)",
		border: "1px solid var(--vp-c-divider)",
	},
	".cm-diagnostic": { whiteSpace: "pre-wrap" },
});

const shared: Extension[] = [
	basicSetup,
	javascript({ typescript: true }),
	syntaxHighlighting(highlighting),
	theme,
];

export async function mountPlayground(options: {
	editor: HTMLElement;
	declarations: HTMLElement;
	onState(state: PlaygroundState): void;
}): Promise<Playground> {
	let state: PlaygroundState = { status: "loading", diagnostics: [] };
	const emit = (next: Partial<PlaygroundState>) => {
		state = { ...state, ...next };
		options.onState(state);
	};
	emit({});

	let timer: ReturnType<typeof setTimeout> | undefined;
	let nextId = 0;
	let running: { id: number; code: string } | undefined;
	let queued: string | undefined;

	const view = new EditorView({
		parent: options.editor,
		state: EditorState.create({
			doc: linkedCode() ?? example,
			extensions: [
				shared,
				lintGutter(),
				EditorView.updateListener.of((update) => {
					if (!update.docChanged) return;
					clearTimeout(timer);
					timer = setTimeout(() => {
						const code = update.view.state.doc.toString();
						history.replaceState(
							history.state,
							"",
							`${prefix}${lz.compressToEncodedURIComponent(code)}`,
						);
						check(code);
					}, 300);
				}),
			],
		}),
	});
	const declarations = new EditorView({
		parent: options.declarations,
		state: EditorState.create({
			doc: "",
			extensions: [
				shared,
				EditorState.readOnly.of(true),
				EditorView.editable.of(false),
			],
		}),
	});

	const worker = new CheckerWorker();
	const post = (message: ToWorker) => worker.postMessage(message);

	function check(code: string) {
		if (running) {
			queued = code;
			return;
		}
		running = { id: ++nextId, code };
		if (state.status !== "loading") emit({ status: "checking" });
		post({ type: "check", id: running.id, code });
	}

	worker.onmessage = (event: MessageEvent<FromWorker>) => {
		const reply = event.data;
		const checked = running;
		running = undefined;
		if (queued !== undefined) {
			const code = queued;
			queued = undefined;
			check(code);
			return;
		}
		if (!checked || reply.id !== checked.id) return;
		if (reply.type === "failure") {
			emit({ status: "failed", failure: reply.message });
			return;
		}
		// Positions refer to the checked text; a later edit schedules another check.
		if (view.state.doc.toString() !== checked.code) return;
		const length = view.state.doc.length;
		const marks: EditorDiagnostic[] = reply.diagnostics.flatMap((d) =>
			d.from === undefined
				? []
				: [
						{
							from: Math.min(d.from, length),
							to: Math.min(d.to ?? d.from, length),
							severity: d.severity,
							message: `${d.message} (TS${d.code})`,
						},
					],
		);
		view.dispatch(setDiagnostics(view.state, marks));
		declarations.dispatch({
			changes: {
				from: 0,
				to: declarations.state.doc.length,
				insert: reply.declarations,
			},
		});
		emit({
			status: "checked",
			diagnostics: reply.diagnostics,
			milliseconds: reply.milliseconds,
		});
	};
	worker.onerror = (event) =>
		emit({ status: "failed", failure: event.message || "The checker failed" });

	// A link opened in the same tab changes only the hash.
	const onHashChange = () => {
		const code = linkedCode();
		if (code === undefined || code === view.state.doc.toString()) return;
		view.dispatch({
			changes: { from: 0, to: view.state.doc.length, insert: code },
		});
	};
	addEventListener("hashchange", onHashChange);

	const types = await import("virtual:typesql-playground-types");
	emit({ versions: types.versions });
	post({ type: "init", wasmUrl, files: types.files });
	check(view.state.doc.toString());

	return {
		reveal(diagnostic) {
			if (diagnostic.from === undefined) return;
			view.dispatch({
				selection: {
					anchor: Math.min(diagnostic.from, view.state.doc.length),
				},
				scrollIntoView: true,
			});
			view.focus();
		},
		reset() {
			history.replaceState(history.state, "", location.pathname);
			view.dispatch({
				changes: { from: 0, to: view.state.doc.length, insert: example },
			});
		},
		link() {
			return `${location.origin}${location.pathname}${prefix}${lz.compressToEncodedURIComponent(view.state.doc.toString())}`;
		},
		dispose() {
			removeEventListener("hashchange", onHashChange);
			clearTimeout(timer);
			worker.terminate();
			view.destroy();
			declarations.destroy();
		},
	};
}
