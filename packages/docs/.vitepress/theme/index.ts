import DefaultTheme from "vitepress/theme";
import { h } from "vue";
import VersionSelector from "./VersionSelector.vue";

export default {
	extends: DefaultTheme,
	Layout: () =>
		h(DefaultTheme.Layout, null, {
			"nav-bar-content-before": () =>
				h(VersionSelector, { class: "navbar-version" }),
			"nav-screen-content-before": () => h(VersionSelector),
		}),
};
