import type { Theme } from "vitepress";
import { inBrowser, onContentUpdated } from "vitepress";
import DefaultTheme from "vitepress/theme";
import { nextTick } from "vue";
import VersionSelector from "./VersionSelector.vue";
import "./style.css";

// Code groups with PostgreSQL and SQLite tabs show one dialect at a time. Picking a
// tab picks it in every group on the page, and the choice is kept for later pages.
const storageKey = "typesql-dialect";

const selectTab = (title: string) => {
	for (const label of document.querySelectorAll<HTMLLabelElement>(
		".vp-code-group > .tabs > label[data-title]",
	)) {
		if (label.dataset.title !== title) continue;
		const input = document.getElementById(label.htmlFor);
		const group = label.parentElement?.parentElement;
		if (!(input instanceof HTMLInputElement) || !group) continue;
		const index = [...group.querySelectorAll(":scope > .tabs > input")].indexOf(
			input,
		);
		const blocks = group.querySelector(":scope > .blocks")?.children;
		if (index < 0 || !blocks?.[index]) continue;
		input.checked = true;
		for (const [i, block] of [...blocks].entries())
			block.classList.toggle("active", i === index);
	}
};

// Storage can be unavailable (blocked cookies, sandboxed frames); tabs then sync
// within the page only.
const readTab = () => {
	try {
		return localStorage.getItem(storageKey);
	} catch {
		return null;
	}
};
const saveTab = (title: string) => {
	try {
		localStorage.setItem(storageKey, title);
	} catch {}
};

const restoreTab = () => {
	const title = readTab();
	if (title) void nextTick().then(() => selectTab(title));
};

export default {
	extends: DefaultTheme,
	enhanceApp({ app }) {
		app.component("VersionSelector", VersionSelector);
		if (!inBrowser) return;
		window.addEventListener("click", (event) => {
			const input = event.target;
			if (!(input instanceof HTMLInputElement)) return;
			if (!input.matches(".vp-code-group > .tabs > input")) return;
			const label = document.querySelector<HTMLLabelElement>(
				`label[for="${input.id}"]`,
			);
			const title = label?.dataset.title;
			if (!label || !title) return;
			saveTab(title);
			// Keep the clicked tab where it is while groups above it change height.
			const top = label.getBoundingClientRect().top;
			selectTab(title);
			window.scrollBy(0, label.getBoundingClientRect().top - top);
		});
	},
	setup() {
		onContentUpdated(restoreTab);
	},
} satisfies Theme;
