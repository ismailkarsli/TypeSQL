// Social preview images: one 1200×630 PNG per page, drawn from its title,
// description and sidebar section when the site is built.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { Resvg } from "@resvg/resvg-js";
import satori from "satori";

export interface OgPage {
	/** The section the page is listed under in the sidebar. */
	section?: string | undefined;
	/** The page's `# heading` as written, so `code` spans can be drawn in mono. */
	title: string;
	description: string;
}

export const ogWidth = 1200;
export const ogHeight = 630;

const require = createRequire(import.meta.url);

const fonts = [
	{
		name: "Inter",
		data: readFileSync(
			require.resolve("@fontsource/inter/files/inter-latin-400-normal.woff"),
		),
		weight: 400 as const,
	},
	{
		name: "Inter",
		data: readFileSync(
			require.resolve("@fontsource/inter/files/inter-latin-600-normal.woff"),
		),
		weight: 600 as const,
	},
	{
		name: "Inter",
		data: readFileSync(
			require.resolve("@fontsource/inter/files/inter-latin-800-normal.woff"),
		),
		weight: 800 as const,
	},
	{
		name: "JetBrains Mono",
		data: readFileSync(
			require.resolve(
				"@fontsource/jetbrains-mono/files/jetbrains-mono-latin-700-normal.woff",
			),
		),
		weight: 700 as const,
	},
];

const logo = `data:image/svg+xml;base64,${readFileSync(
	new URL("../public/logo.svg", import.meta.url),
).toString("base64")}`;

const rose = "#e11d48";
const ink = "#0f172a";
const muted = "#475569";

/** The element tree satori lays out, written without JSX. */
type Style = Record<string, string | number>;
type Child = Element | string | null;
interface Element {
	type: "div" | "span" | "img";
	props: { style: Style; children?: Child | Child[]; src?: string };
}
const h = (
	type: Element["type"],
	style: Style,
	children: Child | Child[],
): Element => ({ type, props: { style, children } });

const codeStyle = {
	fontFamily: "JetBrains Mono",
	fontWeight: 700,
	color: rose,
	fontSize: "0.92em",
};

/** One span per word, so the title wraps between words and `code` is drawn in mono. */
const words = (title: string) =>
	title.split("`").flatMap((text, i) =>
		text
			.split(/\s+/)
			.filter(Boolean)
			.map((word) => h("span", i % 2 ? codeStyle : {}, word)),
	);

export async function renderOgImage(page: OgPage): Promise<Buffer> {
	const titleSize = page.title.length > 28 ? 64 : 76;
	const svg = await satori(
		h(
			"div",
			{
				boxSizing: "border-box",
				width: ogWidth,
				height: ogHeight,
				display: "flex",
				flexDirection: "column",
				backgroundColor: "#ffffff",
				fontFamily: "Inter",
				color: ink,
				borderBottom: `14px solid ${rose}`,
				padding: "72px 88px 64px",
			},
			[
				h("div", { display: "flex", alignItems: "center", gap: 18 }, [
					{
						type: "img",
						props: { style: { width: 56, height: 56 }, src: logo },
					},
					h("div", { display: "flex", fontSize: 40, fontWeight: 800 }, [
						h("span", {}, "Type"),
						h("span", { color: rose }, "SQL"),
					]),
				]),
				h(
					"div",
					{
						display: "flex",
						flexDirection: "column",
						justifyContent: "flex-end",
						flexGrow: 1,
						width: "100%",
					},
					[
						page.section
							? h(
									"div",
									{
										fontSize: 26,
										fontWeight: 600,
										color: rose,
										textTransform: "uppercase",
										letterSpacing: "0.08em",
										marginBottom: 18,
									},
									page.section,
								)
							: null,
						h(
							"div",
							{
								display: "flex",
								flexWrap: "wrap",
								width: "100%",
								columnGap: "0.25em",
								fontSize: titleSize,
								fontWeight: 800,
								lineHeight: 1.1,
								letterSpacing: "-0.02em",
							},
							words(page.title),
						),
						page.description
							? h(
									"div",
									{
										display: "block",
										width: "100%",
										marginTop: 28,
										fontSize: 30,
										lineHeight: 1.4,
										color: muted,
										lineClamp: 3,
									},
									page.description,
								)
							: null,
					],
				),
			],
		),
		{ width: ogWidth, height: ogHeight, fonts },
	);
	return new Resvg(svg, { fitTo: { mode: "width", value: ogWidth } })
		.render()
		.asPng();
}
