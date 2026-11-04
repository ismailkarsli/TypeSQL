/** Messages between the Playground page and its checker worker. */

interface InitMessage {
	type: "init";
	/** Where to fetch tsrs.wasm. */
	wasmUrl: string;
	/** Declaration files of the packages the application can import, by absolute path. */
	files: Record<string, string>;
}

export interface CheckMessage {
	type: "check";
	id: number;
	code: string;
}

export type ToWorker = InitMessage | CheckMessage;

export interface PlaygroundDiagnostic {
	/** UTF-16 offsets into the application, when the diagnostic has a position there. */
	from?: number;
	to?: number;
	line?: number;
	column?: number;
	/** Another file the diagnostic belongs to, such as a TypeSQL declaration file. */
	file?: string;
	code: number;
	severity: "error" | "warning" | "info";
	message: string;
}

interface CheckResult {
	type: "result";
	id: number;
	diagnostics: PlaygroundDiagnostic[];
	/** The application's emitted declarations. */
	declarations: string;
	milliseconds: number;
}

interface CheckFailure {
	type: "failure";
	id: number;
	message: string;
}

export type FromWorker = CheckResult | CheckFailure;
