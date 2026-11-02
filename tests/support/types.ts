export interface Scenario {
	scripts: Record<string, string>;
	consumer?: {
		database?: "postgres" | "sqlite";
		failure?: { stage: "generate" | "compile" | "start"; exitCode: number };
		artifacts?: string[];
	};
}
export interface Diagnostic {
	code: number;
	category: number;
	message: string;
	file?: string;
	line?: number;
	column?: number;
	expression?: string;
	details?: Diagnostic[];
	related?: Diagnostic[];
}
export interface CompilerObservation {
	types: Record<string, string>;
	diagnostics: Diagnostic[];
}
export interface ApplicationException {
	name: string;
	message: string;
	code?: number | string;
	text?: string;
	cause?: ApplicationException;
}
interface CommandObservation {
	status: number;
	stdout: string;
	stderr: string;
}
export interface Observation {
	setup?: CommandObservation;
	generate?: CommandObservation;
	compile?: CommandObservation;
	start?: CommandObservation;
	compiler?: CompilerObservation;
	exception?: ApplicationException;
	artifacts?: Record<string, string>;
}
