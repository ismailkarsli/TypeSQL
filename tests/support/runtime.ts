import { writeFileSync } from "node:fs";
import type { ApplicationException } from "./types.ts";

const errorFile = process.env.CONSUMER_ERROR_FILE;
if (!errorFile) throw new Error("CONSUMER_ERROR_FILE is required");

// Monitoring preserves Node's normal exception reporting and exit status.
process.on("uncaughtExceptionMonitor", (error) => {
	function describe(
		e: Error & Pick<ApplicationException, "code" | "text">,
	): ApplicationException {
		const value: ApplicationException = { name: e.name, message: e.message };
		if (e.code !== undefined) value.code = e.code;
		if (e.text !== undefined) value.text = e.text;
		if (e.cause instanceof Error) value.cause = describe(e.cause);
		return value;
	}
	writeFileSync(errorFile, JSON.stringify(describe(error)));
});
