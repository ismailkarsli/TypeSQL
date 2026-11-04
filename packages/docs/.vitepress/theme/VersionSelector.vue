<script setup lang="ts">
import { useData } from "vitepress";
import type { VersionTheme } from "../versions";

defineProps<{ screenMenu?: boolean }>();

const { page, theme } = useData<VersionTheme>();

// biome-ignore lint/correctness/noUnusedVariables: used by the Vue template.
function switchVersion(event: Event) {
	const select = event.target;
	if (!(select instanceof HTMLSelectElement)) return;
	const target = theme.value.docsVersions.find((v) => v.base === select.value);
	if (!target) return;
	const path = page.value.relativePath.replace(/\.md$/, "");
	const exists = target.pages.includes(path);
	const url = exists ? path.replace(/(^|\/)index$/, "$1") : "";
	window.location.assign(
		`${target.base}${url}${exists ? window.location.hash : ""}`,
	);
}
</script>

<template>
	<label class="docs-version" :class="{ 'screen-menu': screenMenu }">
		<span :class="screenMenu ? 'version-label' : 'visually-hidden'">{{ screenMenu ? 'Version' : 'Documentation version' }}</span>
		<span class="version-control">
			<select
				:value="theme.docsVersion === 'latest' ? '/' : `/v${theme.docsVersion}/`"
				@change="switchVersion"
			>
				<option v-for="version in theme.docsVersions" :key="version.base" :value="version.base">
					{{ `v${version.version}${version.base === '/' ? ' · Latest' : ''}` }}
				</option>
			</select>
			<svg class="chevron" viewBox="0 0 16 16" fill="none" aria-hidden="true">
				<path d="m5 6.5 3 3 3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
			</svg>
		</span>
	</label>
</template>

<style scoped>
.docs-version {
	display: flex;
	align-items: center;
	align-self: center;
	padding-left: 12px;
}
.version-control {
	position: relative;
	display: inline-flex;
	align-items: center;
}
select {
	appearance: none;
	max-width: 180px;
	min-height: 32px;
	padding: 4px 30px 4px 12px;
	border: 1px solid transparent;
	border-radius: 8px;
	background: var(--vp-c-bg-soft);
	color: var(--vp-c-text-2);
	font-size: 12px;
	font-weight: 600;
	font-variant-numeric: tabular-nums;
	line-height: 22px;
	cursor: pointer;
	transition: border-color 0.2s, background-color 0.2s, color 0.2s;
}
select:hover {
	border-color: var(--vp-c-divider);
	background: var(--vp-c-default-soft);
	color: var(--vp-c-text-1);
}
select:focus-visible {
	outline: 2px solid var(--vp-c-brand-1);
	outline-offset: 3px;
}
.chevron {
	position: absolute;
	right: 9px;
	width: 16px;
	height: 16px;
	color: var(--vp-c-text-3);
	pointer-events: none;
}
.version-control:hover .chevron,
.version-control:focus-within .chevron {
	color: var(--vp-c-brand-1);
}
.screen-menu {
	justify-content: space-between;
	gap: 12px;
	margin-top: 24px;
	padding: 12px 14px 12px 16px;
	border-radius: 8px;
	background: var(--vp-c-bg-soft);
}
.screen-menu select {
	background: var(--vp-c-bg);
}
.version-label {
	font-size: 12px;
	font-weight: 500;
	color: var(--vp-c-text-2);
}
.visually-hidden {
	position: absolute;
	width: 1px;
	height: 1px;
	overflow: hidden;
	clip-path: inset(50%);
}
</style>
