import { writeFileSync } from "node:fs";

// Monitoring preserves Node's normal exception reporting and exit status.
process.on("uncaughtExceptionMonitor", (error) => {
	function describe(e) {
		const value = { name: e.name, message: e.message };
		if (e.code !== undefined) value.code = e.code;
		if (e.text !== undefined) value.text = e.text;
		if (e.cause instanceof Error) value.cause = describe(e.cause);
		return value;
	}
	writeFileSync(
		process.env.CONSUMER_ERROR_FILE,
		JSON.stringify(describe(error)),
	);
});
