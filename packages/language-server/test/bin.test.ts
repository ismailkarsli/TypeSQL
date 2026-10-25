/** `typesql-language-server [root]`: the proxy, for the root given as an argument (made absolute) or none. */
import { resolve } from "node:path";
import { afterEach, expect, test, vi } from "vitest";

const start = vi.hoisted(() => vi.fn());
vi.mock("../src/proxy.js", () => ({ start }));

const argv = process.argv;
afterEach(() => {
	process.argv = argv;
	start.mockClear();
});

const run = async (...args: string[]): Promise<unknown[][]> => {
	process.argv = ["node", "typesql-language-server", ...args];
	vi.resetModules();
	await import("../src/bin.js");
	return start.mock.calls;
};

test("no root: the editor's workspace", async () => {
	expect(await run()).toEqual([[undefined]]);
});

test("a root, relative to the current directory", async () => {
	expect(await run("some/project")).toEqual([[resolve("some/project")]]);
});
