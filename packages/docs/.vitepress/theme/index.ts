import type { Theme } from "vitepress";
import DefaultTheme from "vitepress/theme";
import VersionSelector from "./VersionSelector.vue";

export default {
	extends: DefaultTheme,
	enhanceApp({ app }) {
		app.component("VersionSelector", VersionSelector);
	},
} satisfies Theme;
