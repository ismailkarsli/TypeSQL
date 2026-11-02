/** The pnpm v9 dependency document; all package metadata is retained on disk. */
export interface LockedResolution {
	specifier: string;
	version: string;
}
export interface Importer {
	dependencies?: Record<string, LockedResolution>;
	devDependencies?: Record<string, LockedResolution>;
	optionalDependencies?: Record<string, LockedResolution>;
}
export interface Snapshot {
	dependencies?: Record<string, string>;
	optionalDependencies?: Record<string, string>;
	optional?: boolean;
}
export interface LockedPackage {
	resolution: { integrity?: string; tarball?: string };
	optional?: boolean;
}
export interface Lockfile {
	importers: Record<string, Importer>;
	packages: Record<string, LockedPackage>;
	snapshots: Record<string, Snapshot>;
	overrides?: Record<string, string>;
	catalogs?: object;
	pnpmfileChecksum?: string;
}
export type JsonValue =
	| string
	| number
	| boolean
	| null
	| JsonValue[]
	| { [key: string]: JsonValue };
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
export interface CommandObservation {
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
