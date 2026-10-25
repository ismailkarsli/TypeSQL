import { expect, test, vi } from "vitest";

test("the typesql bin runs the CLI on its arguments and exits with its code", async () => {
	const { argv, exitCode } = process;
	const url = process.env["DATABASE_URL"];
	const stderr = vi
		.spyOn(process.stderr, "write")
		.mockImplementation(() => true);
	process.argv = [argv[0]!, "/usr/local/bin/typesql", "introspect"];
	delete process.env["DATABASE_URL"];
	try {
		await import("../src/bin.js");
		expect(process.exitCode).toBe(2);
		expect(stderr).toHaveBeenCalledWith(
			"typesql introspect: pass --url or set DATABASE_URL\n",
		);
	} finally {
		stderr.mockRestore();
		process.argv = argv;
		process.exitCode = exitCode;
		if (url !== undefined) process.env["DATABASE_URL"] = url;
	}
});
