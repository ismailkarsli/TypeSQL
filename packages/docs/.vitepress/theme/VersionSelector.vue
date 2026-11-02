<script setup lang="ts">
import { useData } from "vitepress";
import type { VersionTheme } from "../versions";

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
	<label class="docs-version">
		<span class="visually-hidden">Documentation version</span>
		<select
			:value="theme.docsVersion === 'latest' ? '/' : `/versions/${theme.docsVersion}/`"
			@change="switchVersion"
		>
			<option v-for="version in theme.docsVersions" :key="version.base" :value="version.base">
				{{ version.base === '/' ? `${version.version} (latest)` : version.version }}
			</option>
		</select>
	</label>
</template>

<style scoped>
.docs-version {
	display: flex;
	align-items: center;
	padding: 12px;
	font-size: 14px;
	font-weight: 500;
}
select {
	appearance: auto;
	max-width: 180px;
	padding: 4px 8px;
	border: 1px solid var(--vp-c-divider);
	border-radius: 6px;
	background: var(--vp-c-bg);
	color: var(--vp-c-text-1);
	cursor: pointer;
}
.visually-hidden {
	position: absolute;
	width: 1px;
	height: 1px;
	overflow: hidden;
	clip-path: inset(50%);
}
@media (max-width: 767px) {
	.navbar-version {
		display: none;
	}
}
</style>
