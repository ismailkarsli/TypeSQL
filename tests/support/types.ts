export type Database = "postgres" | "sqlite" | "mysql" | "mariadb";
export interface Scenario {
	scripts?: Record<string, string>;
	scenario?: {
		database?: Database;
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
	/** Left out of a failed compilation, whose output repeats `compiler.diagnostics`. */
	stdout?: string;
	/** Left out of a failed start, whose output repeats `exception` with a stack trace. */
	stderr?: string;
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
