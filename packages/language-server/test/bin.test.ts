/** `typesql-language-server <pipe>`: starts the completion server with `pipe`. */
import { afterEach, expect, test, vi } from "vitest";

const start = vi.hoisted(() => vi.fn());
vi.mock("../src/server.js", () => ({ start }));

const argv = process.argv;
afterEach(() => {
	process.argv = argv;
	start.mockClear();
});

test("passes the pipe argument to start()", async () => {
	process.argv = ["node", "typesql-language-server", "/tmp/tsgo.sock"];
	vi.resetModules();
	await import("../src/bin.js");
	expect(start.mock.calls).toEqual([["/tmp/tsgo.sock"]]);
});
