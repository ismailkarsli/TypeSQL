import {
	type Connector,
	Session,
	type TypeScriptModules,
} from "@typesql/language-server";

// A TypeScript API client whose pipe to the language server can die.
let pipeAlive = true;
let dieDuringRequest = false;
const clients: { closed: boolean }[] = [];
const FakeAPI = {
	fromLSPConnection: async () => {
		const client = { closed: false };
		clients.push(client);
		const generation = clients.length;
		pipeAlive = true;
		return {
			getCurrentLanguageServerSnapshot: async () => {
				if (!pipeAlive || generation !== clients.length)
					throw new Error("the pipe is closed");
				return {
					getDefaultProjectForFile: async () => {
						if (dieDuringRequest) {
							dieDuringRequest = false;
							pipeAlive = false;
							throw new Error("the pipe closed during the request");
						}
						return undefined;
					},
					dispose: async () => {
						if (!pipeAlive) throw new Error("the pipe is closed");
					},
				};
			},
			close: async () => {
				client.closed = true;
			},
		};
	},
};
const modules: TypeScriptModules = {
	// Only what a session calls of TypeScript's API client.
	// biome-ignore lint/plugin: the fake stands in for the class.
	// biome-ignore lint/nursery/noUnsafeTypeAssertion: see above.
	API: FakeAPI as unknown as TypeScriptModules["API"],
	SyntaxKind: {
		Identifier: 1,
		CallExpression: 2,
		PropertyAccessExpression: 3,
		StringLiteral: 4,
		NoSubstitutionTemplateLiteral: 5,
		TemplateExpression: 6,
	},
	dir: "(fake)",
	version: "7.1",
};
const connector: Connector = {
	pipe: async () => "fake-pipe",
	modules: () => [async () => modules],
};

const logged: string[] = [];
const session = new Session(connector, (message, level = "info") => {
	if (level === "error") logged.push(message.split("\n")[0]!);
});
const uri = new URL("app.js", import.meta.url).href;
const state = () => ({
	opened: clients.length,
	closed: clients.filter((c) => c.closed).length,
});

await session.highlight(uri);
console.log("connected", state());

dieDuringRequest = true;
await session.highlight(uri);
console.log("died during a request", state());

await session.highlight(uri);
console.log("found out the pipe is dead", state());

await session.highlight(uri);
console.log("next request reconnects", state());

await session.close();
console.log("closed", state());

await session.highlight(uri);
console.log("a request after close opens nothing", state());
console.log(logged);
