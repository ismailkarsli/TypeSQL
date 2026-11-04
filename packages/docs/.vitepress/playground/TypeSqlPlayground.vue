<script setup lang="ts">
// biome-ignore-all lint/correctness/noUnusedVariables: the template uses these bindings.
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from "vue";
import type { Playground, PlaygroundState } from "./editor.ts";
import type { PlaygroundDiagnostic } from "./protocol.ts";

const editor = ref<HTMLElement>();
const declarations = ref<HTMLElement>();
const state = shallowRef<PlaygroundState>({
	status: "loading",
	diagnostics: [],
});
const tab = ref<"errors" | "types">("errors");
const copied = ref(false);
let playground: Playground | undefined;
let disposed = false;

onMounted(async () => {
	const { mountPlayground } = await import("./editor.ts");
	if (disposed || !editor.value || !declarations.value) return;
	try {
		playground = await mountPlayground({
			editor: editor.value,
			declarations: declarations.value,
			onState: (next) => {
				state.value = next;
			},
		});
	} catch (error) {
		state.value = {
			...state.value,
			status: "failed",
			failure: String(error),
		};
	}
	if (disposed) playground?.dispose();
});
onBeforeUnmount(() => {
	disposed = true;
	playground?.dispose();
});

const errors = computed(() => state.value.diagnostics);
const status = computed(() => {
	const s = state.value;
	const compiler = s.versions
		? `TypeScript ${s.versions.typescript} (tsrs ${s.versions.tsrs})`
		: "TypeScript 7.1";
	switch (s.status) {
		case "loading":
			return `Loading ${compiler}…`;
		case "checking":
			return "Checking…";
		case "failed":
			return `The checker failed: ${s.failure ?? "unknown error"}`;
		case "checked":
			return `Checked in ${((s.milliseconds ?? 0) / 1000).toFixed(1)} s by ${compiler} with @typesql/core ${s.versions?.typesql ?? ""}`;
	}
	return "";
});

function where(d: PlaygroundDiagnostic): string {
	if (d.line !== undefined) return `app.ts:${d.line}:${d.column ?? 1}`;
	return d.file ?? "Project";
}

async function share() {
	if (!playground) return;
	const link = playground.link();
	history.replaceState(history.state, "", link);
	await navigator.clipboard.writeText(link);
	copied.value = true;
	setTimeout(() => {
		copied.value = false;
	}, 2000);
}
</script>

<template>
	<div class="typesql-playground">
		<div class="toolbar">
			<h1 class="title">Playground</h1>
			<p class="status" :class="state.status" role="status">{{ status }}</p>
			<div class="actions">
				<button type="button" @click="playground?.reset()">Reset</button>
				<button type="button" class="primary" @click="share">
					{{ copied ? "Link copied" : "Copy link" }}
				</button>
			</div>
		</div>
		<div class="panes">
			<div ref="editor" class="editor" aria-label="TypeScript application" />
			<div class="output">
				<div class="tabs" role="tablist">
					<button
						type="button"
						role="tab"
						:aria-selected="tab === 'errors'"
						@click="tab = 'errors'"
					>
						Errors <span class="count">{{ errors.length }}</span>
					</button>
					<button
						type="button"
						role="tab"
						:aria-selected="tab === 'types'"
						@click="tab = 'types'"
					>
						Types (.d.ts)
					</button>
				</div>
				<div v-show="tab === 'errors'" class="errors" role="tabpanel">
					<p v-if="state.status === 'checked' && !errors.length" class="empty">
						No errors.
					</p>
					<ul>
						<li v-for="(d, i) in errors" :key="i">
							<button type="button" :disabled="d.from === undefined" @click="playground?.reveal(d)">
								<span class="where">{{ where(d) }}</span>
								<span class="code">TS{{ d.code }}</span>
								<span class="message">{{ d.message }}</span>
							</button>
						</li>
					</ul>
				</div>
				<div v-show="tab === 'types'" class="types" role="tabpanel">
					<p class="hint">
						The declarations TypeScript emits for <code>app.ts</code>. Export a
						query to see its row and parameter types.
					</p>
					<div ref="declarations" class="declarations" />
				</div>
			</div>
		</div>
	</div>
</template>

<style scoped>
.typesql-playground {
	--typesql-playground-keyword: #d73a49;
	--typesql-playground-string: #032f62;
	--typesql-playground-literal: #005cc5;
	--typesql-playground-type: #6f42c1;
	--typesql-playground-function: #6f42c1;
	--typesql-playground-property: #005cc5;
	--typesql-playground-comment: #6a737d;
	display: flex;
	flex-direction: column;
	height: calc(100vh - var(--vp-nav-height));
	min-height: 480px;
}
.dark .typesql-playground {
	--typesql-playground-keyword: #f97583;
	--typesql-playground-string: #9ecbff;
	--typesql-playground-literal: #79b8ff;
	--typesql-playground-type: #b392f0;
	--typesql-playground-function: #b392f0;
	--typesql-playground-property: #79b8ff;
	--typesql-playground-comment: #8b949e;
}
.toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px 16px;
	padding: 10px 16px;
	border-bottom: 1px solid var(--vp-c-divider);
}
.title {
	margin: 0;
	font-size: 16px;
	font-weight: 600;
}
.status {
	flex: 1;
	margin: 0;
	min-width: 0;
	font-size: 13px;
	color: var(--vp-c-text-2);
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.status.failed {
	color: var(--vp-c-danger-1);
}
.actions {
	display: flex;
	gap: 8px;
}
.actions button {
	padding: 4px 12px;
	border: 1px solid var(--vp-c-divider);
	border-radius: 6px;
	font-size: 13px;
	font-weight: 500;
	color: var(--vp-c-text-1);
	background: var(--vp-c-bg-soft);
}
.actions button:hover {
	border-color: var(--vp-c-brand-1);
}
.actions .primary {
	color: var(--vp-button-brand-text);
	border-color: var(--vp-button-brand-border);
	background: var(--vp-button-brand-bg);
}
.panes {
	display: grid;
	grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
	flex: 1;
	min-height: 0;
}
.editor {
	min-height: 0;
	overflow: hidden;
	border-right: 1px solid var(--vp-c-divider);
}
.output {
	display: flex;
	flex-direction: column;
	min-height: 0;
}
.tabs {
	display: flex;
	gap: 4px;
	padding: 0 12px;
	border-bottom: 1px solid var(--vp-c-divider);
}
.tabs button {
	padding: 8px 10px;
	border-bottom: 2px solid transparent;
	font-size: 13px;
	font-weight: 500;
	color: var(--vp-c-text-2);
}
.tabs button[aria-selected="true"] {
	color: var(--vp-c-text-1);
	border-bottom-color: var(--vp-c-brand-1);
}
.count {
	margin-left: 4px;
	padding: 0 6px;
	border-radius: 8px;
	font-size: 12px;
	background: var(--vp-c-default-soft);
}
.errors,
.types {
	display: flex;
	flex-direction: column;
	flex: 1;
	min-height: 0;
	overflow: auto;
}
.errors ul {
	margin: 0;
	padding: 0;
	list-style: none;
}
.errors li + li {
	border-top: 1px solid var(--vp-c-divider);
}
.errors li button {
	display: grid;
	grid-template-columns: auto 1fr;
	gap: 2px 8px;
	width: 100%;
	padding: 10px 16px;
	text-align: left;
	font-size: 13px;
}
.errors li button:not(:disabled):hover {
	background: var(--vp-c-default-soft);
}
.where {
	font-family: var(--vp-font-family-mono);
	color: var(--vp-c-text-2);
}
.code {
	color: var(--vp-c-danger-1);
	font-family: var(--vp-font-family-mono);
}
.message {
	grid-column: 1 / -1;
	font-family: var(--vp-font-family-mono);
	white-space: pre-wrap;
	word-break: break-word;
}
.empty,
.hint {
	margin: 0;
	padding: 10px 16px;
	font-size: 13px;
	color: var(--vp-c-text-2);
}
.hint code {
	font-size: 12px;
}
.declarations {
	flex: 1;
	min-height: 0;
}
.editor :deep(.cm-editor),
.declarations :deep(.cm-editor) {
	height: 100%;
}
@media (max-width: 768px) {
	.typesql-playground {
		height: auto;
	}
	.panes {
		grid-template-columns: 1fr;
	}
	.editor {
		height: 60vh;
		border-right: 0;
		border-bottom: 1px solid var(--vp-c-divider);
	}
	.output {
		height: 50vh;
	}
}
</style>
